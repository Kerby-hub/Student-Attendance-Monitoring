-- Enable realtime for profiles so signed-in users are notified when their
-- account status is changed by an admin (auto-logout inactive accounts).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'profiles'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles';
  END IF;
END$$;

-- Ensure UPDATE payloads carry the full new row (needed to read status).
ALTER TABLE public.profiles REPLICA IDENTITY FULL;