import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/teacher/schedules")({
  component: SchedulesPage,
});

function SchedulesPage() {
  const { user, hasRole } = useAuth();

  const { data = [], isLoading } = useQuery({
    queryKey: ["teacher-all-schedules", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedules")
        .select(`*,
          subjects:subjects!class_schedules_subject_id_fkey(code,name),
          sections:sections!class_schedules_section_id_fkey(name),
          teachers:teachers!class_schedules_teacher_id_fkey(user_id, full_name)`)
        .order("day").order("start_time");
      if (error) throw error;
      return hasRole("admin") ? (data as any[]) : (data as any[]).filter((s) => s.teachers?.user_id === user!.id);
    },
  });

  return (
    <div>
      <PageHeader title="My Schedules" description="All your assigned class meetings." />
      <div className="rounded-lg border bg-card overflow-x-auto shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead><TableHead>Time</TableHead>
              <TableHead>Subject</TableHead><TableHead>Section</TableHead>
              <TableHead>Room</TableHead><TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">No assigned schedules.</TableCell></TableRow>
            ) : data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="capitalize">{s.day}</TableCell>
                <TableCell>{s.start_time?.slice(0,5)} – {s.end_time?.slice(0,5)}</TableCell>
                <TableCell><span className="font-mono text-xs text-muted-foreground">{s.subjects?.code}</span> {s.subjects?.name}</TableCell>
                <TableCell>{s.sections?.name}</TableCell>
                <TableCell>{s.room ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <Link to="/teacher/attendance-session/$scheduleId" params={{ scheduleId: s.id }}>
                    <Button size="sm" variant="outline">Open session</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
