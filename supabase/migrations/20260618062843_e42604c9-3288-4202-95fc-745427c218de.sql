
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS sender_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notif_created_at ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_read ON public.notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_notif_broadcast ON public.notifications(broadcast_id);
CREATE INDEX IF NOT EXISTS idx_cal_events_starts_at ON public.calendar_events(starts_at);
CREATE INDEX IF NOT EXISTS idx_cal_events_audience ON public.calendar_events(audience);
