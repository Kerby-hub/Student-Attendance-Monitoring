
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience_type text NOT NULL,
  audience_filter jsonb NOT NULL DEFAULT '{}'::jsonb,
  message text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;

ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage broadcasts"
ON public.broadcasts FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

ALTER TABLE public.sms_logs ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sms_logs_broadcast_id_idx ON public.sms_logs(broadcast_id);
