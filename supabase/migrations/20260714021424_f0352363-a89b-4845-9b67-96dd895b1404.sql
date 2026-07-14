
-- =========================================================================
-- Academic Year & Semester Management
-- =========================================================================

-- 1) Enums --------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.academic_year_status AS ENUM ('active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.semester_status AS ENUM ('draft','active','closed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.enrollment_status AS ENUM ('active','completed','transferred','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) academic_years ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_years (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  start_date date,
  end_date date,
  status public.academic_year_status NOT NULL DEFAULT 'active',
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ay_dates_ok CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date)
);

GRANT SELECT ON public.academic_years TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;

ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ay_read_auth ON public.academic_years;
CREATE POLICY ay_read_auth ON public.academic_years
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS ay_admin_all ON public.academic_years;
CREATE POLICY ay_admin_all ON public.academic_years
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_ay_updated ON public.academic_years;
CREATE TRIGGER trg_ay_updated BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS ay_only_one_current
  ON public.academic_years ((true)) WHERE is_current = true;

-- 3) semesters -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.semesters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  name text NOT NULL,
  start_date date,
  end_date date,
  status public.semester_status NOT NULL DEFAULT 'draft',
  is_current boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sem_dates_ok CHECK (end_date IS NULL OR start_date IS NULL OR end_date > start_date),
  UNIQUE (academic_year_id, name)
);

GRANT SELECT ON public.semesters TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.semesters TO authenticated;
GRANT ALL ON public.semesters TO service_role;

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sem_read_auth ON public.semesters;
CREATE POLICY sem_read_auth ON public.semesters
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS sem_admin_all ON public.semesters;
CREATE POLICY sem_admin_all ON public.semesters
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP TRIGGER IF EXISTS trg_sem_updated ON public.semesters;
CREATE TRIGGER trg_sem_updated BEFORE UPDATE ON public.semesters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS sem_only_one_current
  ON public.semesters ((true)) WHERE is_current = true;

CREATE INDEX IF NOT EXISTS idx_sem_ay ON public.semesters(academic_year_id);

-- Enforce single-current at write time (both flags)
CREATE OR REPLACE FUNCTION public.enforce_single_current_academic_year()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE public.academic_years SET is_current = false WHERE id <> NEW.id AND is_current = true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_ay_single_current ON public.academic_years;
CREATE TRIGGER trg_ay_single_current
  BEFORE INSERT OR UPDATE OF is_current ON public.academic_years
  FOR EACH ROW WHEN (NEW.is_current = true)
  EXECUTE FUNCTION public.enforce_single_current_academic_year();

CREATE OR REPLACE FUNCTION public.enforce_single_current_semester()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.is_current THEN
    UPDATE public.semesters SET is_current = false WHERE id <> NEW.id AND is_current = true;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_sem_single_current ON public.semesters;
CREATE TRIGGER trg_sem_single_current
  BEFORE INSERT OR UPDATE OF is_current ON public.semesters
  FOR EACH ROW WHEN (NEW.is_current = true)
  EXECUTE FUNCTION public.enforce_single_current_semester();

-- 4) student_enrollments -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE RESTRICT,
  academic_year_id uuid NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  semester_id uuid NOT NULL REFERENCES public.semesters(id) ON DELETE RESTRICT,
  status public.enrollment_status NOT NULL DEFAULT 'active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, semester_id, section_id)
);

GRANT SELECT ON public.student_enrollments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.student_enrollments TO authenticated;
GRANT ALL ON public.student_enrollments TO service_role;

ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS enr_admin_all ON public.student_enrollments;
CREATE POLICY enr_admin_all ON public.student_enrollments
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS enr_teacher_read ON public.student_enrollments;
CREATE POLICY enr_teacher_read ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'teacher'));

DROP POLICY IF EXISTS enr_student_read_own ON public.student_enrollments;
CREATE POLICY enr_student_read_own ON public.student_enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.students s
      WHERE s.id = student_enrollments.student_id AND s.user_id = auth.uid()
  ));

DROP TRIGGER IF EXISTS trg_enr_updated ON public.student_enrollments;
CREATE TRIGGER trg_enr_updated BEFORE UPDATE ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_enr_semester ON public.student_enrollments(semester_id);
CREATE INDEX IF NOT EXISTS idx_enr_student ON public.student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enr_section ON public.student_enrollments(section_id);

-- 5) class_schedules: add nullable AY/semester ---------------------------
ALTER TABLE public.class_schedules
  ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS semester_id uuid REFERENCES public.semesters(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sched_semester ON public.class_schedules(semester_id);
CREATE INDEX IF NOT EXISTS idx_sched_ay ON public.class_schedules(academic_year_id);

-- 6) Backfill default AY + Semester --------------------------------------
DO $$
DECLARE
  v_ay uuid;
  v_sem uuid;
BEGIN
  -- Use existing school_year value if present, else 2025-2026
  INSERT INTO public.academic_years (name, status, is_current)
  VALUES ('2025-2026', 'active', true)
  ON CONFLICT (name) DO UPDATE SET is_current = true
  RETURNING id INTO v_ay;

  IF v_ay IS NULL THEN
    SELECT id INTO v_ay FROM public.academic_years WHERE name = '2025-2026';
  END IF;

  INSERT INTO public.semesters (academic_year_id, name, status, is_current)
  VALUES (v_ay, '1st Semester', 'active', true)
  ON CONFLICT (academic_year_id, name) DO UPDATE SET status='active', is_current=true
  RETURNING id INTO v_sem;

  IF v_sem IS NULL THEN
    SELECT id INTO v_sem FROM public.semesters
      WHERE academic_year_id = v_ay AND name = '1st Semester';
  END IF;

  -- Backfill schedules
  UPDATE public.class_schedules
    SET academic_year_id = v_ay, semester_id = v_sem
    WHERE semester_id IS NULL;

  -- Backfill enrollments for currently active students with a section
  INSERT INTO public.student_enrollments (student_id, section_id, academic_year_id, semester_id, status)
  SELECT s.id, s.section_id, v_ay, v_sem, 'active'
    FROM public.students s
    WHERE s.section_id IS NOT NULL
      AND s.status = 'active'
  ON CONFLICT (student_id, semester_id, section_id) DO NOTHING;
END $$;

-- 7) Update student_check_in to reject closed semesters ------------------
CREATE OR REPLACE FUNCTION public.student_check_in(
  _qr_token text, _lat double precision, _lng double precision,
  _accuracy double precision DEFAULT NULL::double precision)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_session record;
  v_student_id uuid;
  v_existing uuid;
  v_grace_minutes int;
  v_qr_seconds int;
  v_now timestamptz := now();
  v_zone record;
  v_in_zone boolean := true;
  v_distance double precision;
  v_best_distance double precision := NULL;
  v_best_radius int := NULL;
  v_status attendance_status := 'present';
  v_schedule record;
  v_semester record;
  v_class_start timestamptz;
  v_class_end timestamptz;
  v_accuracy_m double precision := 0;
  v_tolerance double precision := 0;
  v_allowed_radius double precision;
BEGIN
  SELECT (value::text)::int INTO v_qr_seconds FROM public.system_settings WHERE key='qr_rotation_seconds';
  SELECT (value::text)::int INTO v_grace_minutes FROM public.system_settings WHERE key='late_grace_minutes';
  v_qr_seconds := COALESCE(v_qr_seconds, 15);
  v_grace_minutes := COALESCE(v_grace_minutes, 10);

  v_accuracy_m := GREATEST(COALESCE(_accuracy, 0), 0);
  v_tolerance := LEAST(v_accuracy_m, 50);

  IF _lat IS NULL OR _lng IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'geo_unavailable', 'message', 'Location coordinates are required to check in.');
  END IF;

  SELECT * INTO v_session FROM public.attendance_sessions
    WHERE qr_token = _qr_token AND status = 'open' LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'QR code is invalid or session is closed.');
  END IF;

  SELECT * INTO v_schedule FROM public.class_schedules WHERE id = v_session.schedule_id;

  -- Reject if schedule is bound to a closed/archived semester
  IF v_schedule.semester_id IS NOT NULL THEN
    SELECT * INTO v_semester FROM public.semesters WHERE id = v_schedule.semester_id;
    IF v_semester.status IN ('closed','archived') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'semester_closed',
        'message', 'This semester is already closed. New attendance check-ins are no longer allowed.');
    END IF;
  END IF;

  IF v_session.expires_at IS NOT NULL AND v_now > v_session.expires_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'session_ended', 'message', 'Check-in is closed. This session has already ended.');
  END IF;
  IF v_schedule.end_time IS NOT NULL THEN
    v_class_end := (current_date + v_schedule.end_time);
    IF v_now > v_class_end THEN
      RETURN jsonb_build_object('ok', false, 'code', 'session_ended', 'message', 'Check-in is closed. This session has already ended.');
    END IF;
  END IF;

  IF v_session.qr_rotated_at IS NOT NULL
     AND v_now > v_session.qr_rotated_at + make_interval(secs => v_qr_seconds + 5) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'expired_token', 'message', 'QR code expired. Please scan the latest one.');
  END IF;

  SELECT id INTO v_student_id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_student', 'message', 'Student record not found.');
  END IF;

  SELECT id INTO v_existing FROM public.attendance_records
    WHERE session_id = v_session.id AND student_id = v_student_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'duplicate', 'message', 'Already checked in for this class.');
  END IF;

  IF EXISTS (SELECT 1 FROM public.schedule_geofences WHERE schedule_id = v_session.schedule_id) THEN
    v_in_zone := false;
    FOR v_zone IN
      SELECT gz.* FROM public.geofence_zones gz
        JOIN public.schedule_geofences sg ON sg.zone_id = gz.id
        WHERE sg.schedule_id = v_session.schedule_id AND gz.active = true
    LOOP
      v_distance := 2 * 6371000 * asin(sqrt(
        sin(radians((_lat - v_zone.center_lat)/2))^2 +
        cos(radians(v_zone.center_lat)) * cos(radians(_lat)) *
        sin(radians((_lng - v_zone.center_lng)/2))^2
      ));
      IF v_best_distance IS NULL OR v_distance < v_best_distance THEN
        v_best_distance := v_distance;
        v_best_radius := v_zone.radius_meters;
      END IF;
      IF v_distance <= (v_zone.radius_meters + v_tolerance) THEN
        v_in_zone := true; EXIT;
      END IF;
    END LOOP;
    IF NOT v_in_zone THEN
      v_allowed_radius := COALESCE(v_best_radius, 0) + v_tolerance;
      RETURN jsonb_build_object(
        'ok', false, 'code', 'outside_zone',
        'message', format(
          'You are outside the allowed location. Distance: %sm, allowed: %sm%s.',
          round(v_best_distance)::text, v_best_radius::text,
          CASE WHEN v_tolerance > 0 THEN ' (+ ' || round(v_tolerance)::text || 'm GPS tolerance)' ELSE '' END
        ),
        'distance_m', round(v_best_distance), 'radius_m', v_best_radius,
        'accuracy_m', v_accuracy_m, 'tolerance_m', v_tolerance, 'allowed_radius_m', v_allowed_radius
      );
    END IF;
  END IF;

  IF v_schedule.start_time IS NOT NULL THEN
    v_class_start := (current_date + v_schedule.start_time);
    IF v_now > v_class_start + make_interval(mins => v_grace_minutes) THEN
      v_status := 'late';
    END IF;
  END IF;

  INSERT INTO public.attendance_records(session_id, student_id, status, check_in_at, check_in_lat, check_in_lng)
  VALUES (v_session.id, v_student_id, v_status, v_now, _lat, _lng);

  RETURN jsonb_build_object('ok', true, 'status', v_status::text, 'message', 'Attendance recorded.');
END;
$function$;

-- 8) Helper RPC: copy students to another semester+section ---------------
CREATE OR REPLACE FUNCTION public.copy_students_to_semester(
  _source_semester_id uuid,
  _source_section_id uuid,
  _target_semester_id uuid,
  _target_section_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_target_ay uuid;
  v_copied int := 0;
  v_skipped int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  IF _source_semester_id = _target_semester_id AND _source_section_id = _target_section_id THEN
    RAISE EXCEPTION 'Source and target must differ';
  END IF;

  SELECT academic_year_id INTO v_target_ay FROM public.semesters WHERE id = _target_semester_id;
  IF v_target_ay IS NULL THEN RAISE EXCEPTION 'Target semester not found'; END IF;

  WITH src AS (
    SELECT DISTINCT e.student_id
      FROM public.student_enrollments e
      WHERE e.semester_id = _source_semester_id
        AND e.section_id  = _source_section_id
        AND e.status = 'active'
  ),
  ins AS (
    INSERT INTO public.student_enrollments (student_id, section_id, academic_year_id, semester_id, status)
    SELECT s.student_id, _target_section_id, v_target_ay, _target_semester_id, 'active'
      FROM src s
    ON CONFLICT (student_id, semester_id, section_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_copied FROM ins;

  SELECT count(*) - v_copied INTO v_skipped
    FROM public.student_enrollments e
    WHERE e.semester_id = _source_semester_id AND e.section_id = _source_section_id AND e.status='active';

  RETURN jsonb_build_object('ok', true, 'copied', v_copied, 'skipped', GREATEST(v_skipped,0));
END; $$;

GRANT EXECUTE ON FUNCTION public.copy_students_to_semester(uuid,uuid,uuid,uuid) TO authenticated;
