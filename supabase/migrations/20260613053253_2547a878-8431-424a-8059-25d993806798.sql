
-- Phase 1: Auth lockdown additions
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Index helps admin user list filters
CREATE INDEX IF NOT EXISTS profiles_status_idx ON public.profiles(status);

-- Allow admin to view all profiles + update them
DROP POLICY IF EXISTS "Admins manage all profiles" ON public.profiles;
CREATE POLICY "Admins manage all profiles" ON public.profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin can read all user_roles & manage them
DROP POLICY IF EXISTS "Admins manage all user_roles" ON public.user_roles;
CREATE POLICY "Admins manage all user_roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Admin can read audit logs (already exists, ensure)
DROP POLICY IF EXISTS "Admins read audit_logs" ON public.audit_logs;
CREATE POLICY "Admins read audit_logs" ON public.audit_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated insert audit_logs" ON public.audit_logs;
CREATE POLICY "Authenticated insert audit_logs" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = actor_id);

-- Settings table for system-wide configuration (QR rotation, late grace minutes)
CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);
GRANT SELECT ON public.system_settings TO authenticated;
GRANT ALL ON public.system_settings TO service_role;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone authenticated reads settings" ON public.system_settings;
CREATE POLICY "Anyone authenticated reads settings" ON public.system_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Admins write settings" ON public.system_settings;
CREATE POLICY "Admins write settings" ON public.system_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.system_settings(key, value) VALUES
  ('qr_rotation_seconds', '15'::jsonb),
  ('late_grace_minutes', '10'::jsonb),
  ('default_geofence_radius_m', '100'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Student check-in RPC (validates session open, token fresh, geofence, dup) 
CREATE OR REPLACE FUNCTION public.student_check_in(
  _qr_token text,
  _lat double precision,
  _lng double precision
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session record;
  v_student_id uuid;
  v_existing uuid;
  v_grace_minutes int;
  v_qr_seconds int;
  v_now timestamptz := now();
  v_zone record;
  v_in_zone boolean := true; -- if no zones assigned, allow
  v_distance double precision;
  v_status attendance_status := 'present';
  v_schedule record;
  v_class_start timestamptz;
BEGIN
  -- Load settings
  SELECT (value::text)::int INTO v_qr_seconds FROM public.system_settings WHERE key='qr_rotation_seconds';
  SELECT (value::text)::int INTO v_grace_minutes FROM public.system_settings WHERE key='late_grace_minutes';
  v_qr_seconds := COALESCE(v_qr_seconds, 15);
  v_grace_minutes := COALESCE(v_grace_minutes, 10);

  -- Find session for token
  SELECT * INTO v_session FROM public.attendance_sessions
    WHERE qr_token = _qr_token AND status = 'open'
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'QR code is invalid or session is closed.');
  END IF;

  -- Token freshness (rotation + small grace)
  IF v_session.qr_rotated_at IS NOT NULL 
     AND v_now > v_session.qr_rotated_at + make_interval(secs => v_qr_seconds + 5) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired_token', 'message', 'QR code expired. Please scan the latest one.');
  END IF;

  -- Find student record
  SELECT id INTO v_student_id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_student', 'message', 'Student record not found.');
  END IF;

  -- Duplicate check
  SELECT id INTO v_existing FROM public.attendance_records
    WHERE session_id = v_session.id AND student_id = v_student_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate', 'message', 'Already checked in for this class.');
  END IF;

  -- Geofence validation
  IF EXISTS (SELECT 1 FROM public.schedule_geofences WHERE schedule_id = v_session.schedule_id) THEN
    v_in_zone := false;
    FOR v_zone IN
      SELECT gz.* FROM public.geofence_zones gz
        JOIN public.schedule_geofences sg ON sg.zone_id = gz.id
        WHERE sg.schedule_id = v_session.schedule_id AND gz.active = true
    LOOP
      -- Haversine
      v_distance := 2 * 6371000 * asin(sqrt(
        sin(radians((_lat - v_zone.center_lat)/2))^2 +
        cos(radians(v_zone.center_lat)) * cos(radians(_lat)) *
        sin(radians((_lng - v_zone.center_lng)/2))^2
      ));
      IF v_distance <= v_zone.radius_meters THEN
        v_in_zone := true;
        EXIT;
      END IF;
    END LOOP;
    IF NOT v_in_zone THEN
      RETURN jsonb_build_object('ok', false, 'code', 'outside_zone', 'message', 'You are outside the allowed location.');
    END IF;
  END IF;

  -- Late detection (compare to class_schedules.start_time today)
  SELECT * INTO v_schedule FROM public.class_schedules WHERE id = v_session.schedule_id;
  IF v_schedule.start_time IS NOT NULL THEN
    v_class_start := (current_date + v_schedule.start_time) AT TIME ZONE current_setting('TIMEZONE');
    IF v_now > v_class_start + make_interval(mins => v_grace_minutes) THEN
      v_status := 'late';
    END IF;
  END IF;

  -- Insert record
  INSERT INTO public.attendance_records(session_id, student_id, status, check_in_at, check_in_lat, check_in_lng)
  VALUES (v_session.id, v_student_id, v_status, v_now, _lat, _lng);

  RETURN jsonb_build_object('ok', true, 'status', v_status::text, 'message', 'Attendance recorded.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_check_in(text, double precision, double precision) TO authenticated;

-- Rotate QR token RPC
CREATE OR REPLACE FUNCTION public.rotate_session_qr(_session_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_token text;
BEGIN
  SELECT teacher_id INTO v_owner FROM public.attendance_sessions WHERE id = _session_id;
  IF v_owner IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT (public.has_role(auth.uid(), 'admin') OR EXISTS (
    SELECT 1 FROM public.teachers WHERE id = v_owner AND user_id = auth.uid()
  )) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  v_token := encode(gen_random_bytes(16), 'hex');
  UPDATE public.attendance_sessions
    SET qr_token = v_token, qr_rotated_at = now(), status = CASE WHEN status='waiting' THEN 'open'::session_status ELSE status END, opened_at = COALESCE(opened_at, now())
    WHERE id = _session_id;
  RETURN v_token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.rotate_session_qr(uuid) TO authenticated;
