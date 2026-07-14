-- Academic Year & Semester Management — idempotent resync + schema reload

DO $$ BEGIN CREATE TYPE public.academic_year_status AS ENUM ('active','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.semester_status AS ENUM ('draft','active','closed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE public.enrollment_status AS ENUM ('active','completed','transferred','inactive');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academic_years TO authenticated;
GRANT ALL ON public.academic_years TO service_role;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ay_read_auth ON public.academic_years;
CREATE POLICY ay_read_auth ON public.academic_years FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS ay_admin_all ON public.academic_years;
CREATE POLICY ay_admin_all ON public.academic_years FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_ay_updated ON public.academic_years;
CREATE TRIGGER trg_ay_updated BEFORE UPDATE ON public.academic_years
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS ay_only_one_current
  ON public.academic_years ((true)) WHERE is_current = true;

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.semesters TO authenticated;
GRANT ALL ON public.semesters TO service_role;
ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sem_read_auth ON public.semesters;
CREATE POLICY sem_read_auth ON public.semesters FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS sem_admin_all ON public.semesters;
CREATE POLICY sem_admin_all ON public.semesters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP TRIGGER IF EXISTS trg_sem_updated ON public.semesters;
CREATE TRIGGER trg_sem_updated BEFORE UPDATE ON public.semesters
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE UNIQUE INDEX IF NOT EXISTS sem_only_one_current
  ON public.semesters ((true)) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_sem_ay ON public.semesters(academic_year_id);

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
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_enrollments TO authenticated;
GRANT ALL ON public.student_enrollments TO service_role;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS enr_admin_all ON public.student_enrollments;
CREATE POLICY enr_admin_all ON public.student_enrollments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
DROP POLICY IF EXISTS enr_teacher_read ON public.student_enrollments;
CREATE POLICY enr_teacher_read ON public.student_enrollments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'teacher'));
DROP POLICY IF EXISTS enr_student_read_own ON public.student_enrollments;
CREATE POLICY enr_student_read_own ON public.student_enrollments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.students s
    WHERE s.id = student_enrollments.student_id AND s.user_id = auth.uid()));
DROP TRIGGER IF EXISTS trg_enr_updated ON public.student_enrollments;
CREATE TRIGGER trg_enr_updated BEFORE UPDATE ON public.student_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX IF NOT EXISTS idx_enr_semester ON public.student_enrollments(semester_id);
CREATE INDEX IF NOT EXISTS idx_enr_student ON public.student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enr_section ON public.student_enrollments(section_id);

ALTER TABLE public.class_schedules
  ADD COLUMN IF NOT EXISTS academic_year_id uuid REFERENCES public.academic_years(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS semester_id uuid REFERENCES public.semesters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_sched_semester ON public.class_schedules(semester_id);
CREATE INDEX IF NOT EXISTS idx_sched_ay ON public.class_schedules(academic_year_id);

-- Backfill default AY + Semester (no ON CONFLICT DO UPDATE — avoids trigger conflict)
DO $$
DECLARE v_ay uuid; v_sem uuid;
BEGIN
  SELECT id INTO v_ay FROM public.academic_years WHERE name = '2025-2026';
  IF v_ay IS NULL THEN
    INSERT INTO public.academic_years (name, status, is_current)
      VALUES ('2025-2026', 'active', true) RETURNING id INTO v_ay;
  END IF;

  SELECT id INTO v_sem FROM public.semesters
    WHERE academic_year_id = v_ay AND name = '1st Semester';
  IF v_sem IS NULL THEN
    INSERT INTO public.semesters (academic_year_id, name, status, is_current)
      VALUES (v_ay, '1st Semester', 'active', true) RETURNING id INTO v_sem;
  END IF;

  UPDATE public.class_schedules
    SET academic_year_id = v_ay, semester_id = v_sem
    WHERE semester_id IS NULL;

  INSERT INTO public.student_enrollments (student_id, section_id, academic_year_id, semester_id, status)
  SELECT s.id, s.section_id, v_ay, v_sem, 'active'
    FROM public.students s
    WHERE s.section_id IS NOT NULL AND s.status = 'active'
  ON CONFLICT (student_id, semester_id, section_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION public.copy_students_to_semester(
  _source_semester_id uuid,
  _source_section_id uuid,
  _target_semester_id uuid,
  _target_section_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_target_ay uuid; v_copied int := 0; v_skipped int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _source_semester_id = _target_semester_id AND _source_section_id = _target_section_id THEN
    RAISE EXCEPTION 'Source and target must differ';
  END IF;
  SELECT academic_year_id INTO v_target_ay FROM public.semesters WHERE id = _target_semester_id;
  IF v_target_ay IS NULL THEN RAISE EXCEPTION 'Target semester not found'; END IF;
  WITH src AS (
    SELECT DISTINCT e.student_id FROM public.student_enrollments e
      WHERE e.semester_id = _source_semester_id
        AND e.section_id  = _source_section_id AND e.status = 'active'
  ),
  ins AS (
    INSERT INTO public.student_enrollments (student_id, section_id, academic_year_id, semester_id, status)
    SELECT s.student_id, _target_section_id, v_target_ay, _target_semester_id, 'active' FROM src s
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

NOTIFY pgrst, 'reload schema';
