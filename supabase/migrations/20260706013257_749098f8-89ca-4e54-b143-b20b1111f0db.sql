
-- Remove any conflicting overloads
DROP FUNCTION IF EXISTS public.student_check_in(text, double precision, double precision);
DROP FUNCTION IF EXISTS public.student_check_in(text, double precision, double precision, double precision);

-- Canonical single definition
CREATE OR REPLACE FUNCTION public.student_check_in(
  _qr_token text,
  _lat double precision,
  _lng double precision,
  _accuracy double precision DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Normalize GPS accuracy: never negative, tolerance capped at 50m.
  v_accuracy_m := GREATEST(COALESCE(_accuracy, 0), 0);
  v_tolerance := LEAST(v_accuracy_m, 50);

  IF _lat IS NULL OR _lng IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'geo_unavailable', 'message', 'Location coordinates are required to check in.');
  END IF;

  SELECT * INTO v_session FROM public.attendance_sessions
    WHERE qr_token = _qr_token AND status = 'open'
    LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_token', 'message', 'QR code is invalid or session is closed.');
  END IF;

  SELECT * INTO v_schedule FROM public.class_schedules WHERE id = v_session.schedule_id;
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
      -- Haversine (meters). Latitude, then longitude.
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
        'ok', false,
        'code', 'outside_zone',
        'message', format(
          'You are outside the allowed location. Distance: %sm, allowed: %sm%s.',
          round(v_best_distance)::text,
          v_best_radius::text,
          CASE WHEN v_tolerance > 0 THEN ' (+ ' || round(v_tolerance)::text || 'm GPS tolerance)' ELSE '' END
        ),
        'distance_m', round(v_best_distance),
        'radius_m', v_best_radius,
        'accuracy_m', v_accuracy_m,
        'tolerance_m', v_tolerance,
        'allowed_radius_m', v_allowed_radius
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

GRANT EXECUTE ON FUNCTION public.student_check_in(text, double precision, double precision, double precision) TO authenticated;

NOTIFY pgrst, 'reload schema';
