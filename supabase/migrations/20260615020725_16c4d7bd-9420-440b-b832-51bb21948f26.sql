
CREATE TABLE public.device_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  device_fingerprint text NOT NULL,
  device_name text,
  user_agent text,
  platform text,
  status text NOT NULL DEFAULT 'active', -- active | disabled | pending
  registration_date timestamptz NOT NULL DEFAULT now(),
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX idx_device_registrations_user ON public.device_registrations(user_id);
CREATE INDEX idx_device_registrations_fp ON public.device_registrations(device_fingerprint);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_registrations TO authenticated;
GRANT ALL ON public.device_registrations TO service_role;

ALTER TABLE public.device_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own device"
  ON public.device_registrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can insert own device"
  ON public.device_registrations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own device last_login"
  ON public.device_registrations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete devices"
  ON public.device_registrations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER touch_device_registrations_updated_at
  BEFORE UPDATE ON public.device_registrations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
