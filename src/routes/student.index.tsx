import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock, XCircle, CalendarRange } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StudentDeviceCard } from "@/components/StudentDeviceCard";
import { useCurrentSemester, useCurrentAcademicYear } from "@/lib/academic/hooks";

export const Route = createFileRoute("/student/")({
  component: StudentDashboard,
});

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function StudentDashboard() {
  const { user, profile } = useAuth();

  const { data: student } = useQuery({
    queryKey: ["my-student", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students").select("*").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const today = DAY_NAMES[new Date().getDay()];
  const { data: currentSemester } = useCurrentSemester();
  const { data: currentYear } = useCurrentAcademicYear();

  const { data: enrollment } = useQuery({
    queryKey: ["my-enrollment", student?.id, currentSemester?.id],
    enabled: !!student?.id && !!currentSemester?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from("student_enrollments" as never)
        .select("*, sections:sections!student_enrollments_section_id_fkey(name)")
        .eq("student_id", student!.id)
        .eq("semester_id", currentSemester!.id)
        .maybeSingle();
      return (data ?? null) as unknown as { section_id: string; sections: { name: string } | null } | null;
    },
  });

  const activeSectionId = enrollment?.section_id ?? student?.section_id ?? null;

  const { data: schedule = [] } = useQuery({
    queryKey: ["my-today-schedule", activeSectionId, today, currentSemester?.id],
    enabled: !!activeSectionId,
    queryFn: async () => {
      let q = supabase
        .from("class_schedules")
        .select("id, start_time, end_time, room, subjects(code, name), teachers(full_name)")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .eq("section_id", activeSectionId!).eq("day", today as any)
        .order("start_time");
      if (currentSemester?.id) q = q.eq("semester_id", currentSemester.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["my-attendance", student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, check_in_at, attendance_sessions(class_schedules(subjects(code, name)))")
        .eq("student_id", student!.id)
        .order("check_in_at", { ascending: false, nullsFirst: false })
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const stats = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.status === "present").length;
    const late = records.filter((r) => r.status === "late").length;
    const absent = records.filter((r) => r.status === "absent").length;
    return { total, present, late, absent, pct: total ? Math.round(((present + late) / total) * 100) : 0 };
  }, [records]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Welcome{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {student ? `${student.student_no} · ${student.program ?? "—"}` : "No student record linked to your account yet."}
          </p>
        </div>
        {currentSemester && (
          <div className="rounded-lg border bg-card px-3 py-2 text-xs">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Current period</p>
            <p className="flex items-center gap-2 font-semibold">
              <CalendarRange className="h-3.5 w-3.5" />
              {currentYear?.name} · {currentSemester.name}
              {enrollment?.sections?.name && <Badge variant="outline" className="text-[10px]">{enrollment.sections.name}</Badge>}
            </p>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total classes" value={stats.total} icon={CalendarDays} />
        <StatCard label="Present" value={stats.present} icon={CheckCircle2} tone="text-green-600" />
        <StatCard label="Late" value={stats.late} icon={Clock} tone="text-yellow-600" />
        <StatCard label="Absent" value={stats.absent} icon={XCircle} tone="text-destructive" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Today's schedule</CardTitle></CardHeader>
          <CardContent>
            {schedule.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No classes today.</p>
            ) : (
              <ul className="divide-y">
                {schedule.map((s) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const subj: any = s.subjects;
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const t: any = s.teachers;
                  return (
                    <li key={s.id} className="flex items-center justify-between py-3">
                      <div>
                        <p className="font-medium">{subj ? `${subj.code} · ${subj.name}` : "Class"}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.start_time?.slice(0, 5)} – {s.end_time?.slice(0, 5)}
                          {s.room && ` · Room ${s.room}`}
                          {t?.full_name && ` · ${t.full_name}`}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Attendance rate</CardTitle></CardHeader>
            <CardContent>
              <p className="text-4xl font-bold">{stats.pct}%</p>
              <Progress className="mt-3" value={stats.pct} />
              <p className="mt-2 text-xs text-muted-foreground">Based on {stats.total} recent classes.</p>
            </CardContent>
          </Card>
          <StudentDeviceCard />
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No attendance records yet.</p>
          ) : (
            <ul className="divide-y">
              {records.map((r) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const subj: any = r.attendance_sessions?.class_schedules?.subjects;
                return (
                  <li key={r.id} className="flex items-center justify-between py-3">
                    <div>
                      <p className="text-sm font-medium">{subj ? `${subj.code} · ${subj.name}` : "Class"}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.check_in_at ? new Date(r.check_in_at).toLocaleString() : "—"}
                      </p>
                    </div>
                    <Badge variant={r.status === "present" ? "default" : r.status === "late" ? "secondary" : "destructive"}>
                      {r.status}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, icon: Icon, tone = "" }: { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone?: string }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent><div className={`text-3xl font-bold ${tone}`}>{value}</div></CardContent>
    </Card>
  );
}
