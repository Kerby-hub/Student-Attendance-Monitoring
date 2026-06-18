ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS event_type text,
  ADD COLUMN IF NOT EXISTS location text;

GRANT INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;