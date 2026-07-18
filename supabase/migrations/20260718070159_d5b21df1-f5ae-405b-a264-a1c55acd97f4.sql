-- Canonical, duplicate-safe attendance close and guardian SMS automation.

CREATE UNIQUE INDEX IF NOT EXISTS sms_logs_unique_notif
  ON public.sms_logs (session_id, student_id, notification_type)
  WHERE session_id IS NOT NULL
    AND student_id IS NOT NULL
    AND notification_type IN ('late', 'absence');

CREATE OR REPLACE FUNCTION public.attendance_record_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student public.students%ROWTYPE;
  v_subject text;
  v_session_date text;
  v_session_time text;
  v_notification_type text;
  v_message text;
  v_provider text := 'stub';
  v_log_status public.sms_status := 'stubbed'::public.sms_status;
BEGIN
  -- Only notify for a newly assigned late/absent state. This also supports
  -- corrections from another state while avoiding repeated same-state updates.
  IF NEW.status NOT IN ('late'::public.attendance_status, 'absent'::public.attendance_status)
     OR (TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT * INTO v_student
  FROM public.students
  WHERE id = NEW.student_id;

  IF NOT FOUND OR v_student.status <> 'active' OR NULLIF(trim(v_student.guardian_phone), '') IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(sub.name), ''), NULLIF(trim(sub.code), ''), 'class'),
         to_char(COALESCE(sess.opened_at, sess.created_at, NEW.created_at, now()), 'YYYY-MM-DD'),
         to_char(COALESCE(NEW.check_in_at, sess.opened_at, sess.created_at, now()), 'HH24:MI')
    INTO v_subject, v_session_date, v_session_time
  FROM public.attendance_sessions sess
  JOIN public.class_schedules cs ON cs.id = sess.schedule_id
  LEFT JOIN public.subjects sub ON sub.id = cs.subject_id
  WHERE sess.id = NEW.session_id;

  SELECT COALESCE(trim(both '"' from value::text), 'stub')
    INTO v_provider
  FROM public.system_settings
  WHERE key = 'sms_provider';

  IF COALESCE(v_provider, 'stub') <> 'stub' THEN
    v_log_status := 'pending'::public.sms_status;
  END IF;

  IF NEW.status = 'late'::public.attendance_status THEN
    v_notification_type := 'late';
    v_message := 'Your child ' || v_student.full_name || ' was marked late for '
      || COALESCE(v_subject, 'class') || ' on ' || COALESCE(v_session_date, to_char(now(), 'YYYY-MM-DD'))
      || ' at ' || COALESCE(v_session_time, to_char(now(), 'HH24:MI')) || '.';
  ELSE
    v_notification_type := 'absence';
    v_message := 'Your child ' || v_student.full_name || ' was marked absent for '
      || COALESCE(v_subject, 'class') || ' on ' || COALESCE(v_session_date, to_char(now(), 'YYYY-MM-DD')) || '.';
  END IF;

  INSERT INTO public.sms_logs (
    recipient_user_id,
    phone,
    message,
    status,
    provider_response,
    session_id,
    student_id,
    notification_type,
    error_message
  ) VALUES (
    v_student.user_id,
    trim(v_student.guardian_phone),
    v_message,
    v_log_status,
    CASE
      WHEN v_log_status = 'stubbed'::public.sms_status
        THEN jsonb_build_object('stub', true, 'source', 'attendance_trigger')
      ELSE jsonb_build_object('queued', true, 'source', 'attendance_trigger')
    END,
    NEW.session_id,
    NEW.student_id,
    v_notification_type,
    NULL
  )
  ON CONFLICT (session_id, student_id, notification_type) DO NOTHING;

  RETURN NEW;
END;
$function$;

-- Remove all legacy aliases so each attendance change creates at most one log.
DROP TRIGGER IF EXISTS attendance_record_notify_trg ON public.attendance_records;
DROP TRIGGER IF EXISTS trg_attendance_record_notify ON public.attendance_records;

CREATE TRIGGER attendance_record_notify_trg
AFTER INSERT OR UPDATE OF status ON public.attendance_records
FOR EACH ROW
WHEN (NEW.status IN ('late'::public.attendance_status, 'absent'::public.attendance_status))
EXECUTE FUNCTION public.attendance_record_notify();

CREATE OR REPLACE FUNCTION public.attendance_session_on_close()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_section_id uuid;
BEGIN
  SELECT cs.section_id
    INTO v_section_id
  FROM public.class_schedules cs
  WHERE cs.id = NEW.schedule_id;

  IF v_section_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.attendance_records (session_id, student_id, status)
  SELECT NEW.id, st.id, 'absent'::public.attendance_status
  FROM public.students st
  WHERE st.section_id = v_section_id
    AND st.status = 'active'
  ON CONFLICT (session_id, student_id) DO NOTHING;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS attendance_session_on_close_trg ON public.attendance_sessions;
DROP TRIGGER IF EXISTS trg_attendance_session_on_close ON public.attendance_sessions;

CREATE TRIGGER attendance_session_on_close_trg
AFTER UPDATE OF status ON public.attendance_sessions
FOR EACH ROW
WHEN (NEW.status = 'closed'::public.session_status AND OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.attendance_session_on_close();

NOTIFY pgrst, 'reload schema';