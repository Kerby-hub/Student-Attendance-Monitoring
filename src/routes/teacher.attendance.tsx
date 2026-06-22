import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/teacher/attendance")({
  component: TeacherAttendancePage,
});

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function TeacherAttendancePage() {
  const { user, hasRole } = useAuth();
  const today = DAYS[new Date().getDay()];

  const { data = [], isLoading } = useQuery({
    queryKey: ["teacher-attendance-today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedules")
        .select(`*,
          subjects:subjects!class_schedules_subject_id_fkey(code,name),
          sections:sections!class_schedules_section_id_fkey(name),
          teachers:teachers!class_schedules_teacher_id_fkey(user_id)`)
        .eq("day", today)
        .order("start_time");
      if (error) throw error;
      return hasRole("admin") ? data as any[] : (data as any[]).filter((s) => s.teachers?.user_id === user!.id);
    },
  });

  return (
    <div>
      <PageHeader title="Attendance Session" description="Pick today's class to open its live attendance session — generate the rotating QR code, view check-ins in real time, and close the session." />
      {isLoading ? <p className="text-muted-foreground">Loading…</p> :
        data.length === 0 ? (
          <Card className="shadow-[var(--shadow-card)]"><CardContent className="py-10 text-center text-muted-foreground">No classes today.</CardContent></Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((s) => (
              <Card key={s.id} className="shadow-[var(--shadow-card)]">
                <CardContent className="p-5">
                  <p className="font-mono text-xs text-muted-foreground">{s.subjects?.code}</p>
                  <h3 className="font-semibold">{s.subjects?.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{s.sections?.name} • {s.start_time?.slice(0,5)}–{s.end_time?.slice(0,5)}</p>
                  <Link to="/teacher/attendance-session/$scheduleId" params={{ scheduleId: s.id }}>
                    <Button size="sm" className="mt-3 w-full">Open session</Button>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
    </div>
  );
}
