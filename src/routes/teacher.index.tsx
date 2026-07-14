import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarClock, Play, CalendarRange } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrentSemester, useCurrentAcademicYear } from "@/lib/academic/hooks";

export const Route = createFileRoute("/teacher/")({
  component: TeacherDashboard,
});

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;

function TeacherDashboard() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const today = DAYS[new Date().getDay()];
  const { data: currentSemester } = useCurrentSemester();
  const { data: currentYear } = useCurrentAcademicYear();

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ["teacher-today", user?.id, today, currentSemester?.id],
    enabled: !!user,
    queryFn: async () => {
      let query = supabase
        .from("class_schedules")
        .select(`
          *,
          subjects:subjects!class_schedules_subject_id_fkey(code, name),
          sections:sections!class_schedules_section_id_fkey(name),
          teachers:teachers!class_schedules_teacher_id_fkey(user_id, full_name)
        `)
        .eq("day", today)
        .order("start_time");
      if (currentSemester?.id) query = query.eq("semester_id", currentSemester.id);
      const { data, error } = await query;
      if (error) throw error;
      if (isAdmin) return data as any[];
      return (data as any[]).filter((s) => s.teachers?.user_id === user!.id);
    },
  });

  return (
    <div>
      <PageHeader
        title="Today's classes"
        description={`Showing schedules for ${new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
        action={
          currentSemester ? (
            <Badge variant="outline" className="gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" />
              {currentYear?.name} · {currentSemester.name}
            </Badge>
          ) : null
        }
      />
      {isLoading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : schedules.length === 0 ? (
        <Card className="shadow-[var(--shadow-card)]"><CardContent className="py-10 text-center text-muted-foreground">
          <CalendarClock className="mx-auto mb-2 h-8 w-8 opacity-40" />
          No classes scheduled today.
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {schedules.map((s) => (
            <Card key={s.id} className="shadow-[var(--shadow-card)] hover:shadow-[var(--shadow-card-hover)] transition">
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-muted-foreground">{s.subjects?.code}</p>
                    <h3 className="font-semibold">{s.subjects?.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">Section {s.sections?.name} • Room {s.room ?? "TBA"}</p>
                  </div>
                  <Badge variant="outline">{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</Badge>
                </div>
                <Link to="/teacher/attendance-session/$scheduleId" params={{ scheduleId: s.id }}>
                  <Button size="sm" className="mt-4 w-full">
                    <Play className="mr-1.5 h-4 w-4" /> Open attendance session
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
