
-- ============== ENUMS ==============
CREATE TYPE public.teacher_status AS ENUM ('active', 'inactive');
CREATE TYPE public.student_status AS ENUM ('active', 'inactive', 'graduated');
CREATE TYPE public.day_of_week AS ENUM ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');
CREATE TYPE public.session_status AS ENUM ('waiting','open','closed','expired');
CREATE TYPE public.attendance_status AS ENUM ('present','late','absent');
CREATE TYPE public.calendar_audience AS ENUM ('all','teachers','students');
CREATE TYPE public.sms_status AS ENUM ('pending','sent','failed');

-- ============== UTILITY TRIGGER (reuse if not present) ==============
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- ============== DEPARTMENTS ==============
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dept_read_all_auth" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "dept_admin_all" ON public.departments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_dept_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== SUBJECTS ==============
CREATE TABLE public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  units numeric(3,1) NOT NULL DEFAULT 3 CHECK (units >= 0),
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subjects TO authenticated;
GRANT ALL ON public.subjects TO service_role;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "subj_read_all_auth" ON public.subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "subj_admin_all" ON public.subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_subj_updated BEFORE UPDATE ON public.subjects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== SECTIONS ==============
CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  program text,
  year_level int CHECK (year_level BETWEEN 1 AND 10),
  school_year text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, school_year)
);
GRANT SELECT ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sec_read_all_auth" ON public.sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sec_admin_all" ON public.sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_sec_updated BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== TEACHERS ==============
CREATE TABLE public.teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  teacher_no text NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  position text,
  status public.teacher_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.teachers TO authenticated;
GRANT ALL ON public.teachers TO service_role;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teach_admin_all" ON public.teachers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "teach_self_read" ON public.teachers FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "teach_read_basic" ON public.teachers FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'student'));
CREATE TRIGGER trg_teach_updated BEFORE UPDATE ON public.teachers FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== STUDENTS ==============
CREATE TABLE public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  student_no text NOT NULL UNIQUE,
  full_name text NOT NULL,
  program text,
  year_level int CHECK (year_level BETWEEN 1 AND 10),
  section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL,
  contact_number text,
  parent_contact text,
  status public.student_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.students TO authenticated;
GRANT ALL ON public.students TO service_role;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stud_admin_all" ON public.students FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "stud_self_read" ON public.students FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "stud_self_update" ON public.students FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "stud_teacher_read" ON public.students FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'teacher'));
CREATE TRIGGER trg_stud_updated BEFORE UPDATE ON public.students FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== TEACHER ASSIGNMENTS ==============
CREATE TABLE public.teacher_subjects (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, subject_id)
);
GRANT SELECT ON public.teacher_subjects TO authenticated;
GRANT ALL ON public.teacher_subjects TO service_role;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ts_read_auth" ON public.teacher_subjects FOR SELECT TO authenticated USING (true);
CREATE POLICY "ts_admin_all" ON public.teacher_subjects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.teacher_sections (
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (teacher_id, section_id)
);
GRANT SELECT ON public.teacher_sections TO authenticated;
GRANT ALL ON public.teacher_sections TO service_role;
ALTER TABLE public.teacher_sections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tsec_read_auth" ON public.teacher_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "tsec_admin_all" ON public.teacher_sections FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============== CLASS SCHEDULES ==============
CREATE TABLE public.class_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE RESTRICT,
  room text,
  day public.day_of_week NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  semester text NOT NULL,
  school_year text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_time > start_time)
);
GRANT SELECT ON public.class_schedules TO authenticated;
GRANT ALL ON public.class_schedules TO service_role;
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sched_admin_all" ON public.class_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sched_read_auth" ON public.class_schedules FOR SELECT TO authenticated USING (true);
CREATE TRIGGER trg_sched_updated BEFORE UPDATE ON public.class_schedules FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== GEOFENCE ZONES ==============
CREATE TABLE public.geofence_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  center_lat double precision NOT NULL,
  center_lng double precision NOT NULL,
  radius_meters int NOT NULL CHECK (radius_meters > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.geofence_zones TO authenticated;
GRANT ALL ON public.geofence_zones TO service_role;
ALTER TABLE public.geofence_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "geo_read_auth" ON public.geofence_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "geo_admin_all" ON public.geofence_zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_geo_updated BEFORE UPDATE ON public.geofence_zones FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.schedule_geofences (
  schedule_id uuid NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.geofence_zones(id) ON DELETE CASCADE,
  PRIMARY KEY (schedule_id, zone_id)
);
GRANT SELECT ON public.schedule_geofences TO authenticated;
GRANT ALL ON public.schedule_geofences TO service_role;
ALTER TABLE public.schedule_geofences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sgeo_read_auth" ON public.schedule_geofences FOR SELECT TO authenticated USING (true);
CREATE POLICY "sgeo_admin_all" ON public.schedule_geofences FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============== ATTENDANCE SESSIONS ==============
CREATE TABLE public.attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.teachers(id) ON DELETE RESTRICT,
  status public.session_status NOT NULL DEFAULT 'waiting',
  qr_token text NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  qr_rotated_at timestamptz NOT NULL DEFAULT now(),
  opened_at timestamptz,
  closed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sess_schedule ON public.attendance_sessions(schedule_id);
CREATE INDEX idx_sess_status ON public.attendance_sessions(status);
GRANT SELECT, INSERT, UPDATE ON public.attendance_sessions TO authenticated;
GRANT ALL ON public.attendance_sessions TO service_role;
ALTER TABLE public.attendance_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sess_admin_all" ON public.attendance_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "sess_teacher_own" ON public.attendance_sessions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.teachers t WHERE t.id = teacher_id AND t.user_id = auth.uid()));
CREATE POLICY "sess_student_read_section" ON public.attendance_sessions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.class_schedules cs
    JOIN public.students s ON s.section_id = cs.section_id
    WHERE cs.id = schedule_id AND s.user_id = auth.uid()
  ));
CREATE TRIGGER trg_sess_updated BEFORE UPDATE ON public.attendance_sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== ATTENDANCE RECORDS ==============
CREATE TABLE public.attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.attendance_sessions(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  check_in_at timestamptz,
  check_out_at timestamptz,
  check_in_lat double precision,
  check_in_lng double precision,
  check_out_lat double precision,
  check_out_lng double precision,
  status public.attendance_status NOT NULL DEFAULT 'present',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);
CREATE INDEX idx_rec_student ON public.attendance_records(student_id);
GRANT SELECT, INSERT, UPDATE ON public.attendance_records TO authenticated;
GRANT ALL ON public.attendance_records TO service_role;
ALTER TABLE public.attendance_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rec_admin_all" ON public.attendance_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "rec_student_own" ON public.attendance_records FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()));
CREATE POLICY "rec_student_insert" ON public.attendance_records FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()));
CREATE POLICY "rec_student_update_own" ON public.attendance_records FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.user_id = auth.uid()));
CREATE POLICY "rec_teacher_session" ON public.attendance_records FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.attendance_sessions sess
    JOIN public.teachers t ON t.id = sess.teacher_id
    WHERE sess.id = session_id AND t.user_id = auth.uid()
  ));
CREATE TRIGGER trg_rec_updated BEFORE UPDATE ON public.attendance_records FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== CALENDAR EVENTS ==============
CREATE TABLE public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  audience public.calendar_audience NOT NULL DEFAULT 'all',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at >= starts_at)
);
GRANT SELECT ON public.calendar_events TO authenticated;
GRANT ALL ON public.calendar_events TO service_role;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cal_admin_all" ON public.calendar_events FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "cal_read_audience" ON public.calendar_events FOR SELECT TO authenticated
  USING (
    audience = 'all'
    OR (audience = 'teachers' AND public.has_role(auth.uid(),'teacher'))
    OR (audience = 'students' AND public.has_role(auth.uid(),'student'))
  );
CREATE TRIGGER trg_cal_updated BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============== SMS LOGS ==============
CREATE TABLE public.sms_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  phone text NOT NULL,
  message text NOT NULL,
  status public.sms_status NOT NULL DEFAULT 'pending',
  provider_response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sms_logs TO authenticated;
GRANT ALL ON public.sms_logs TO service_role;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_admin_all" ON public.sms_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- ============== NOTIFICATIONS ==============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  type text,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notif_user ON public.notifications(user_id);
GRANT SELECT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif_admin_all" ON public.notifications FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "notif_own_read" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_own_update" ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ============== AUDIT LOGS ==============
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_admin_all" ON public.audit_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
