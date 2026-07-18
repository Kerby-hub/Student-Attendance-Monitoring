REVOKE ALL ON FUNCTION public.attendance_record_notify() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_record_notify() FROM anon;
REVOKE ALL ON FUNCTION public.attendance_record_notify() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_record_notify() TO service_role;

REVOKE ALL ON FUNCTION public.attendance_session_on_close() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attendance_session_on_close() FROM anon;
REVOKE ALL ON FUNCTION public.attendance_session_on_close() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_session_on_close() TO service_role;