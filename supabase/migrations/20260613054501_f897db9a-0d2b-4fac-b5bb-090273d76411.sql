
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
  SELECT s.user_id, s.contact_number INTO v_user_id, v_phone
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
