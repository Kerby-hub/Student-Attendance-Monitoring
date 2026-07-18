
-- 1. Refresh notify function with guardian-facing wording
CREATE OR REPLACE FUNCTION public.attendance_record_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student record;
  v_user_id uuid;
  v_guardian_phone text;
  v_subject text;
  v_date text;
  v_time text;
  v_title text;
  v_body text;
  v_notif_type text;
  v_sms_body text;
BEGIN
  SELECT s.* INTO v_student FROM public.students s WHERE s.id = NEW.student_id;
  IF NOT FOUND OR v_student.status <> 'active' THEN RETURN NEW; END IF;
  v_user_id := v_student.user_id;

  v_guardian_phone := COALESCE(NULLIF(trim(v_student.guardian_phone), ''),
                               NULLIF(trim(v_student.parent_contact), ''),
                               NULLIF(trim(v_student.contact_number), ''));

  SELECT COALESCE(sub.code || ' — ' || sub.name, 'class')
    INTO v_subject
    FROM public.attendance_sessions sess
    JOIN public.class_schedules cs ON cs.id = sess.schedule_id
    LEFT JOIN public.subjects sub ON sub.id = cs.subject_id
    WHERE sess.id = NEW.session_id;

  v_date := to_char(COALESCE(NEW.check_in_at, now()), 'YYYY-MM-DD');
  v_time := to_char(COALESCE(NEW.check_in_at, now()), 'HH24:MI');

  IF NEW.status = 'late' THEN
    v_title := 'Marked late';
    v_body  := 'You were marked late for ' || COALESCE(v_subject,'class') || ' on ' || v_date || ' at ' || v_time || '.';
    v_notif_type := 'late';
    v_sms_body := 'SAMS: Your child ' || v_student.full_name || ' was marked LATE for '
      || COALESCE(v_subject,'class') || ' on ' || v_date || ' at ' || v_time || '.';
  ELSIF NEW.status = 'absent' THEN
    v_title := 'Absence recorded';
    v_body  := 'You were marked absent for ' || COALESCE(v_subject,'class') || ' on ' || v_date || '.';
    v_notif_type := 'absence';
    v_sms_body := 'SAMS: Your child ' || v_student.full_name || ' was marked ABSENT for '
      || COALESCE(v_subject,'class') || ' on ' || v_date || '.';
  ELSE
    RETURN NEW;
  END IF;

  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, title, body, type)
      VALUES (v_user_id, v_title, v_body, v_notif_type)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_guardian_phone IS NOT NULL THEN
    INSERT INTO public.sms_logs(
      recipient_user_id, phone, message, status, provider_response,
      session_id, student_id, notification_type
    ) VALUES (
      v_user_id, v_guardian_phone, v_sms_body, 'pending',
      jsonb_build_object('queued', true, 'source', 'attendance_trigger'),
      NEW.session_id, NEW.student_id, v_notif_type
    )
    ON CONFLICT (session_id, student_id, notification_type) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Attach notify trigger to attendance_records (was missing)
DROP TRIGGER IF EXISTS attendance_record_notify_trg ON public.attendance_records;
CREATE TRIGGER attendance_record_notify_trg
  AFTER INSERT ON public.attendance_records
  FOR EACH ROW EXECUTE FUNCTION public.attendance_record_notify();

-- 3. On session close: auto-mark absent for enrolled students who didn't check in
CREATE OR REPLACE FUNCTION public.attendance_session_on_close()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_section_id uuid;
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    SELECT section_id INTO v_section_id
      FROM public.class_schedules WHERE id = NEW.schedule_id;

    IF v_section_id IS NOT NULL THEN
      INSERT INTO public.attendance_records(session_id, student_id, status)
      SELECT NEW.id, st.id, 'absent'
        FROM public.students st
       WHERE st.section_id = v_section_id
         AND st.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM public.attendance_records r
            WHERE r.session_id = NEW.id AND r.student_id = st.id
         );
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS attendance_session_on_close_trg ON public.attendance_sessions;
CREATE TRIGGER attendance_session_on_close_trg
  AFTER UPDATE OF status ON public.attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION public.attendance_session_on_close();
