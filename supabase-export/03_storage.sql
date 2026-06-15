-- Storage bucket: student-avatars (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('student-avatars', 'student-avatars', false)
ON CONFLICT (id) DO NOTHING;
