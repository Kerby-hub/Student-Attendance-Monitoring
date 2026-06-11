
-- 1. Extend students table
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS middle_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS profile_picture_url text;

-- Add archived status enum value
DO $$ BEGIN
  ALTER TYPE public.student_status ADD VALUE IF NOT EXISTS 'archived';
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. student_profiles (extended info managed by the student)
CREATE TABLE IF NOT EXISTS public.student_profiles (
  student_id uuid PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  address text,
  birthdate date,
  gender text,
  emergency_contact_name text,
  emergency_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_profiles TO authenticated;
GRANT ALL ON public.student_profiles TO service_role;

ALTER TABLE public.student_profiles ENABLE ROW LEVEL SECURITY;

-- Admins manage all profiles
CREATE POLICY "Admins manage student profiles"
  ON public.student_profiles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Students view/update their own profile
CREATE POLICY "Students view own profile"
  ON public.student_profiles FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.students s
            WHERE s.id = student_profiles.student_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Students upsert own profile insert"
  ON public.student_profiles FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.students s
            WHERE s.id = student_profiles.student_id AND s.user_id = auth.uid())
  );

CREATE POLICY "Students update own profile"
  ON public.student_profiles FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.students s
            WHERE s.id = student_profiles.student_id AND s.user_id = auth.uid())
  );

-- Teachers view profiles of students in their sections
CREATE POLICY "Teachers view student profiles"
  ON public.student_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.students s
      JOIN public.teacher_sections ts ON ts.section_id = s.section_id
      JOIN public.teachers t ON t.id = ts.teacher_id
      WHERE s.id = student_profiles.student_id AND t.user_id = auth.uid()
    )
  );

CREATE TRIGGER trg_student_profiles_updated
  BEFORE UPDATE ON public.student_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3. Allow a student to update their OWN students row (limited fields enforced client-side)
DO $$ BEGIN
  CREATE POLICY "Students update own student row"
    ON public.students FOR UPDATE
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Students view own student row"
    ON public.students FOR SELECT
    USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
