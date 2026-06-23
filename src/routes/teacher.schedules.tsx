import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/teacher/schedules")({
  component: SchedulesPage,
});

type ScheduleRow = {
  id: string; subject_id: string; section_id: string; teacher_id: string;
  day: string; start_time: string; end_time: string; room: string | null;
  subjects: { code: string; name: string } | null;
  sections: { id: string; name: string } | null;
  teachers: { user_id: string | null; full_name: string } | null;
};

function SchedulesPage() {
  const { user, hasRole } = useAuth();
  const [viewing, setViewing] = useState<ScheduleRow | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ["teacher-all-schedules", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedules")
        .select(`*,
          subjects:subjects!class_schedules_subject_id_fkey(code,name),
          sections:sections!class_schedules_section_id_fkey(id,name),
          teachers:teachers!class_schedules_teacher_id_fkey(user_id, full_name)`)
        .order("day").order("start_time");
      if (error) throw error;
      const rows = (data as unknown as ScheduleRow[]) ?? [];
      return hasRole("admin") ? rows : rows.filter((s) => s.teachers?.user_id === user!.id);
    },
  });

  return (
    <div>
      <PageHeader title="My Schedules" description="Read-only view of all your assigned class meetings. Click View Students to see who's enrolled, or open the live attendance session." />
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
                <TableCell className="text-right space-x-1">
                  <Button size="sm" variant="ghost" onClick={() => setViewing(s)} title="View students">
                    <Users className="mr-1 h-4 w-4" />Students
                  </Button>
                  <Link to="/teacher/attendance-session/$scheduleId" params={{ scheduleId: s.id }}>
                    <Button size="sm" variant="outline">Open session</Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ScheduleStudentsDialog schedule={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function ScheduleStudentsDialog({ schedule, onClose }: { schedule: ScheduleRow | null; onClose: () => void }) {
  const [q, setQ] = useState("");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["teacher-schedule-students", schedule?.id, schedule?.section_id],
    enabled: !!schedule?.section_id,
    queryFn: async () => {
      const { data: students, error: e1 } = await supabase
        .from("students")
        .select("id, student_no, full_name, email, status, section_id")
        .eq("section_id", schedule!.section_id)
        .eq("status", "active")
        .order("full_name");
      if (e1) throw e1;
      const studentIds = (students ?? []).map((s) => s.id);
      if (studentIds.length === 0) return [] as Array<typeof students[number] & { latest_status?: string | null }>;

      // Latest attendance status per student for this schedule (best-effort).
      const { data: sessions } = await supabase
        .from("attendance_sessions")
        .select("id")
        .eq("schedule_id", schedule!.id);
      const sessionIds = (sessions ?? []).map((s) => s.id);
      let latest: Record<string, string> = {};
      if (sessionIds.length > 0) {
        const { data: recs } = await supabase
          .from("attendance_records")
          .select("student_id, status, created_at")
          .in("session_id", sessionIds)
          .in("student_id", studentIds)
          .order("created_at", { ascending: false });
        (recs ?? []).forEach((r: any) => {
          if (!latest[r.student_id]) latest[r.student_id] = r.status;
        });
      }
      return (students ?? []).map((s) => ({ ...s, latest_status: latest[s.id] ?? null }));
    },
  });

  const filtered = data.filter((s) => {
    if (!q.trim()) return true;
    const needle = q.toLowerCase();
    return (
      s.full_name?.toLowerCase().includes(needle) ||
      s.email?.toLowerCase().includes(needle) ||
      s.student_no?.toLowerCase().includes(needle)
    );
  });

  return (
    <Dialog open={!!schedule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Students — {schedule?.subjects?.code} · {schedule?.sections?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search by name, email, or ID" className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Latest</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : error ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-destructive">Failed to load students.</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                  {data.length === 0 ? "No students assigned to this schedule." : "No matches."}
                </TableCell></TableRow>
              ) : filtered.map((st) => (
                <TableRow key={st.id}>
                  <TableCell className="font-mono text-xs">{st.student_no}</TableCell>
                  <TableCell>{st.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{st.email}</TableCell>
                  <TableCell>
                    {st.latest_status ? (
                      <Badge variant="outline" className="capitalize">{st.latest_status}</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
