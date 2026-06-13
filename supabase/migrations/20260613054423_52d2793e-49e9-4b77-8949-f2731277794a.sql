
-- Trigger: when an attendance_record is inserted, create a notification + sms_logs row for the student
CREATE OR REPLACE FUNCTION public.attendance_record_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_phone text;
  v_subject text;
  v_title text;
  v_body text;
  v_type text;
BEGIN
  SELECT s.user_id, s.contact_no INTO v_user_id, v_phone
    FROM public.students s WHERE s.id = NEW.student_id;
  IF v_user_id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(sub.code || ' · ' || sub.name, 'Class')
    INTO v_subject
    FROM public.attendance_sessions sess
    JOIN public.class_schedules cs ON cs.id = sess.schedule_id
    LEFT JOIN public.subjects sub ON sub.id = cs.subject_id
    WHERE sess.id = NEW.session_id;

  IF NEW.status = 'present' THEN
    v_title := 'Attendance recorded';
    v_body := 'You were marked present for ' || COALESCE(v_subject,'class') || '.';
    v_type := 'confirmation';
  ELSIF NEW.status = 'late' THEN
    v_title := 'Marked late';
    v_body := 'You were marked late for ' || COALESCE(v_subject,'class') || '.';
    v_type := 'late';
  ELSIF NEW.status = 'absent' THEN
    v_title := 'Absence recorded';
    v_body := 'You were marked absent for ' || COALESCE(v_subject,'class') || '.';
    v_type := 'absence';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications(user_id, title, body, type)
    VALUES (v_user_id, v_title, v_body, v_type);

  IF v_phone IS NOT NULL AND length(v_phone) > 0 THEN
    INSERT INTO public.sms_logs(recipient_user_id, phone, message, status, provider_response)
      VALUES (v_user_id, v_phone, v_title || ': ' || v_body, 'stubbed', jsonb_build_object('stub', true, 'auto', true));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_record_notify ON public.attendance_records;
CREATE TRIGGER trg_attendance_record_notify
  AFTER INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_record_notify();

-- RPC: process expired sessions — closes sessions whose schedule end_time has passed, inserting absent rows for missing students
CREATE OR REPLACE FUNCTION public.process_expired_sessions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess record;
  v_closed int := 0;
  v_absents int := 0;
BEGIN
  FOR v_sess IN
    SELECT sess.id, sess.schedule_id, cs.section_id, cs.end_time
      FROM public.attendance_sessions sess
      JOIN public.class_schedules cs ON cs.id = sess.schedule_id
      WHERE sess.status IN ('waiting','open')
        AND (
          (sess.expires_at IS NOT NULL AND now() > sess.expires_at)
          OR (now()::time > cs.end_time AND COALESCE(sess.opened_at, sess.created_at)::date = current_date)
        )
  LOOP
    UPDATE public.attendance_sessions
      SET status = 'closed', closed_at = now()
      WHERE id = v_sess.id;
    v_closed := v_closed + 1;

    INSERT INTO public.attendance_records(session_id, student_id, status)
      SELECT v_sess.id, st.id, 'absent'
        FROM public.students st
        WHERE st.section_id = v_sess.section_id
          AND st.status = 'active'
          AND NOT EXISTS (
            SELECT 1 FROM public.attendance_records r
              WHERE r.session_id = v_sess.id AND r.student_id = st.id
          );
    GET DIAGNOSTICS v_absents = ROW_COUNT;
  END LOOP;

  RETURN jsonb_build_object('closed', v_closed, 'absents_marked', v_absents);
END;
$$;

REVOKE ALL ON FUNCTION public.process_expired_sessions() FROM public;
GRANT EXECUTE ON FUNCTION public.process_expired_sessions() TO authenticated, service_role;
