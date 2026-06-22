import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/teacher/check-in-records")({
  component: CheckInRecordsPage,
});

type Row = {
  id: string;
  status: string;
  check_in_at: string | null;
  check_in_lat: number | null;
  check_in_lng: number | null;
  students: { id: string; full_name: string; student_no: string | null; section_id: string | null } | null;
  attendance_sessions: {
    id: string;
    created_at: string;
    class_schedules: {
      id: string; teacher_id: string;
      subjects: { code: string; name: string } | null;
      sections: { id: string; name: string } | null;
    } | null;
  } | null;
};

function statusBadge(s: string) {
  if (s === "present") return <Badge className="bg-success text-success-foreground">Present</Badge>;
  if (s === "late") return <Badge className="bg-warning text-warning-foreground">Late</Badge>;
  if (s === "absent") return <Badge variant="destructive">Absent</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

function CheckInRecordsPage() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");

  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["teacher-checkin-records", user?.id, from, to],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("attendance_records")
        .select(`id, status, check_in_at, check_in_lat, check_in_lng,
          students:student_id ( id, full_name, student_no, section_id ),
          attendance_sessions:session_id (
            id, created_at,
            class_schedules:schedule_id (
              id, teacher_id,
              subjects:subject_id (code, name),
              sections:section_id (id, name)
            )
          )`)
        .order("check_in_at", { ascending: false, nullsFirst: false })
        .limit(500);
      if (from) q = q.gte("check_in_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to); end.setDate(end.getDate() + 1);
        q = q.lt("check_in_at", end.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as unknown as Row[];
      // Scope to this teacher (admin sees everything)
      if (isAdmin) return rows;
      return rows.filter((r) => {
        // We can't filter by teacher's user_id directly from class_schedules.teacher_id (which is teachers.id),
        // so resolve teacher row id.
        return true; // we filter after we know teacher.id (below)
      });
    },
  });

  // Resolve teacher.id for this user to filter properly
  const { data: teacherId } = useQuery({
    queryKey: ["my-teacher-id", user?.id],
    enabled: !!user && !isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("teachers").select("id").eq("user_id", user!.id).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    data.forEach((r) => {
      const s = r.attendance_sessions?.class_schedules?.subjects;
      if (s) m.set(s.code, `${s.code} · ${s.name}`);
    });
    return Array.from(m.entries());
  }, [data]);

  const [subjF, setSubjF] = useState("all");

  const filtered = useMemo(() => {
    return data.filter((r) => {
      const sched = r.attendance_sessions?.class_schedules;
      if (!isAdmin && teacherId && sched?.teacher_id !== teacherId) return false;
      if (statusF !== "all" && r.status !== statusF) return false;
      if (subjF !== "all" && sched?.subjects?.code !== subjF) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = `${r.students?.full_name ?? ""} ${r.students?.student_no ?? ""} ${sched?.sections?.name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, statusF, subjF, search, isAdmin, teacherId]);

  return (
    <div>
      <PageHeader
        title="Check-In Records"
        description="Historical attendance check-ins from your classes. Use the filters to narrow results."
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search student name, ID, section…" className="pl-9"
            value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusF} onValueChange={setStatusF}>
          <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="present">Present</SelectItem>
            <SelectItem value="late">Late</SelectItem>
            <SelectItem value="absent">Absent</SelectItem>
          </SelectContent>
        </Select>
        <Select value={subjF} onValueChange={setSubjF}>
          <SelectTrigger><SelectValue placeholder="Subject" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map(([code, label]) => (
              <SelectItem key={code} value={code}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex gap-2">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>

      {error ? (
        <Card><CardContent className="py-10 text-center text-destructive">
          Failed to load records: {(error as Error).message}
        </CardContent></Card>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto shadow-[var(--shadow-card)]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Student ID</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Check-in time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Geofence</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">
                  <ClipboardCheck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No check-in records match your filters.
                </TableCell></TableRow>
              ) : filtered.map((r) => {
                const sched = r.attendance_sessions?.class_schedules;
                const t = r.check_in_at ? new Date(r.check_in_at) : null;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.students?.full_name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.students?.student_no ?? "—"}</TableCell>
                    <TableCell>{sched?.subjects ? `${sched.subjects.code} · ${sched.subjects.name}` : "—"}</TableCell>
                    <TableCell>{sched?.sections?.name ?? "—"}</TableCell>
                    <TableCell className="text-sm">{t ? t.toLocaleDateString() : "—"}</TableCell>
                    <TableCell className="text-sm">{t ? t.toLocaleTimeString() : "—"}</TableCell>
                    <TableCell>{statusBadge(r.status)}</TableCell>
                    <TableCell className="font-mono text-[11px] text-muted-foreground">
                      {r.check_in_lat != null && r.check_in_lng != null
                        ? `${r.check_in_lat.toFixed(4)}, ${r.check_in_lng.toFixed(4)}`
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
