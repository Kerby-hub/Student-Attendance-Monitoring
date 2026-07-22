
CREATE TABLE public.programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT programs_dept_code_uniq UNIQUE (department_id, code)
);

CREATE INDEX programs_department_id_idx ON public.programs (department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.programs TO authenticated;
GRANT ALL ON public.programs TO service_role;

ALTER TABLE public.programs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prog_read_all_auth" ON public.programs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "prog_admin_all" ON public.programs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_programs_updated
  BEFORE UPDATE ON public.programs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DO $$
DECLARE
  v_dept uuid;
  r record;
BEGIN
  SELECT id INTO v_dept FROM public.departments ORDER BY name LIMIT 1;
  IF v_dept IS NULL THEN RETURN; END IF;

  FOR r IN
    SELECT DISTINCT trim(p) AS code, COALESCE(dept_id, v_dept) AS department_id
    FROM (
      SELECT program AS p, department_id AS dept_id FROM public.sections
        WHERE program IS NOT NULL AND trim(program) <> ''
      UNION ALL
      SELECT s.program AS p, sec.department_id AS dept_id
        FROM public.students s
        LEFT JOIN public.sections sec ON sec.id = s.section_id
        WHERE s.program IS NOT NULL AND trim(s.program) <> ''
    ) t
  LOOP
    INSERT INTO public.programs (department_id, code, name, status)
    VALUES (r.department_id, r.code, r.code, 'active')
    ON CONFLICT (department_id, code) DO NOTHING;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
