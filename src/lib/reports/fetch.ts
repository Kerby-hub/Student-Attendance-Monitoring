// Shared fetchers for report pages — all use the browser supabase client (RLS-respected).
import { supabase } from "@/integrations/supabase/client";
import type { AttendanceFlatRow } from "./aggregations";
import type { FilterValue } from "@/components/admin/ReportFilters";

export async function fetchAttendance(filters: FilterValue): Promise<AttendanceFlatRow[]> {
  let q = supabase
    .from("attendance_records")
    .select(`
      id, status, check_in_at,
      students:students!attendance_records_student_id_fkey(id, full_name, student_no, program, section_id),
      attendance_sessions:attendance_sessions!attendance_records_session_id_fkey(
        teacher_id,
        teachers:teachers!attendance_sessions_teacher_id_fkey(full_name),
        class_schedules:class_schedules!attendance_sessions_schedule_id_fkey(
          section_id,
          sections:sections!class_schedules_section_id_fkey(id, name),
          subjects:subjects!class_schedules_subject_id_fkey(code, name)
        )
      )
    `)
    .order("check_in_at", { ascending: false })
    .limit(5000);

  if (filters.from) q = q.gte("check_in_at", `${filters.from}T00:00:00`);
  if (filters.to) q = q.lte("check_in_at", `${filters.to}T23:59:59`);
  if (filters.studentId) q = q.eq("student_id", filters.studentId);

  const { data, error } = await q;
  if (error) throw error;

  let rows: AttendanceFlatRow[] = (data ?? []).map((r: any) => ({
    date: r.check_in_at?.slice(0, 10) ?? "",
    time: r.check_in_at?.slice(11, 16) ?? "",
    student_id: r.students?.id ?? "",
    student_no: r.students?.student_no ?? "",
    student: r.students?.full_name ?? "",
    program: r.students?.program ?? "",
    section_id: r.attendance_sessions?.class_schedules?.sections?.id ?? r.students?.section_id ?? null,
    section: r.attendance_sessions?.class_schedules?.sections?.name ?? "",
    subject: r.attendance_sessions?.class_schedules?.subjects?.code ?? "",
    subject_name: r.attendance_sessions?.class_schedules?.subjects?.name ?? "",
    teacher_id: r.attendance_sessions?.teacher_id ?? null,
    teacher: r.attendance_sessions?.teachers?.full_name ?? "",
    status: r.status,
  }));

  if (filters.teacherId) rows = rows.filter((r) => r.teacher_id === filters.teacherId);
  if (filters.sectionId) rows = rows.filter((r) => r.section_id === filters.sectionId);

  return rows;
}
