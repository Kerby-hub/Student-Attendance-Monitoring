
-- 1. Student guardian / emergency contact fields (nullable for backward compatibility)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS guardian_name text,
  ADD COLUMN IF NOT EXISTS guardian_relationship text,
  ADD COLUMN IF NOT EXISTS guardian_phone text,
  ADD COLUMN IF NOT EXISTS guardian_email text,
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text;

-- 2. sms_logs audit / idempotency columns
ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS session_id uuid,
  ADD COLUMN IF NOT EXISTS student_id uuid,
  ADD COLUMN IF NOT EXISTS notification_type text,
  ADD COLUMN IF NOT EXISTS error_message text;

-- FK for reporting (nullable — broadcasts have no session)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_logs_session_id_fkey') THEN
    ALTER TABLE public.sms_logs
      ADD CONSTRAINT sms_logs_session_id_fkey FOREIGN KEY (session_id)
      REFERENCES public.attendance_sessions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sms_logs_student_id_fkey') THEN
    ALTER TABLE public.sms_logs
      ADD CONSTRAINT sms_logs_student_id_fkey FOREIGN KEY (student_id)
      REFERENCES public.students(id) ON DELETE SET NULL;
  END IF;
END$$;

-- Idempotency: one late / one absence SMS per (session, student).
CREATE UNIQUE INDEX IF NOT EXISTS sms_logs_unique_notif
  ON public.sms_logs (session_id, student_id, notification_type)
  WHERE session_id IS NOT NULL
    AND student_id IS NOT NULL
    AND notification_type IN ('late','absence');

CREATE INDEX IF NOT EXISTS sms_logs_status_idx ON public.sms_logs (status);

-- 3. Updated attendance notify trigger
CREATE OR REPLACE FUNCTION public.attendance_record_notify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Prefer guardian phone; fall back to student's contact number
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
    v_body := 'You were marked late for ' || COALESCE(v_subject,'class') || ' on ' || v_date || ' at ' || v_time || '.';
    v_notif_type := 'late';
    v_sms_body := 'SAMS Notice: ' || v_student.full_name || ' was marked LATE for '
      || COALESCE(v_subject,'class') || ' on ' || v_date || ' at ' || v_time
      || '. Please contact the school if clarification is needed.';
  ELSIF NEW.status = 'absent' THEN
    v_title := 'Absence recorded';
    v_body := 'You were marked absent for ' || COALESCE(v_subject,'class') || ' on ' || v_date || '.';
    v_notif_type := 'absence';
    v_sms_body := 'SAMS Notice: ' || v_student.full_name || ' was marked ABSENT from '
      || COALESCE(v_subject,'class') || ' on ' || v_date
      || '. Please contact the school if the absence is excused or requires correction.';
  ELSE
    -- Do NOT send SMS for 'present' or other statuses
    RETURN NEW;
  END IF;

  -- In-app notification for the student user (safe: separate from SMS)
  IF v_user_id IS NOT NULL THEN
    INSERT INTO public.notifications(user_id, title, body, type)
      VALUES (v_user_id, v_title, v_body, v_notif_type)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Queue guardian SMS if a phone is on file. Idempotent via unique index.
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

-- Ensure trigger exists on attendance_records (fires on insert + status change).
DROP TRIGGER IF EXISTS attendance_record_notify_trg ON public.attendance_records;
CREATE TRIGGER attendance_record_notify_trg
AFTER INSERT OR UPDATE OF status ON public.attendance_records
FOR EACH ROW EXECUTE FUNCTION public.attendance_record_notify();

NOTIFY pgrst, 'reload schema';
