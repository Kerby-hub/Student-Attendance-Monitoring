import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileBarChart, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { downloadCsv, downloadXlsx, downloadPdf } from "@/lib/reports/exporters";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export const Route = createFileRoute("/teacher/reports")({
  component: TeacherReports,
});

type R = {
  id: string;
  status: string;
  check_in_at: string | null;
  students: { full_name: string; student_no: string | null } | null;
  attendance_sessions: {
    class_schedules: {
      teacher_id: string;
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

function TeacherReports() {
  const { user, hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [subjF, setSubjF] = useState("all");

  const { data: teacherId } = useQuery({
    queryKey: ["my-teacher-id", user?.id],
    enabled: !!user && !isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("teachers").select("id").eq("user_id", user!.id).maybeSingle();
      return (data?.id as string | undefined) ?? null;
    },
  });

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["teacher-reports", user?.id, from, to],
    enabled: !!user && (isAdmin || teacherId !== undefined),
    queryFn: async () => {
      let q = supabase
        .from("attendance_records")
        .select(`id, status, check_in_at,
          students:student_id ( full_name, student_no ),
          attendance_sessions:session_id (
            class_schedules:schedule_id (
              teacher_id,
              subjects:subject_id (code, name),
              sections:section_id (id, name)
            )
          )`)
        .order("check_in_at", { ascending: false, nullsFirst: false })
        .limit(1000);
      if (from) q = q.gte("check_in_at", new Date(from).toISOString());
      if (to) {
        const end = new Date(to); end.setDate(end.getDate() + 1);
        q = q.lt("check_in_at", end.toISOString());
      }
      const { data, error } = await q;
      if (error) throw error;
      const list = (data ?? []) as unknown as R[];
      if (isAdmin) return list;
      return list.filter((r) => r.attendance_sessions?.class_schedules?.teacher_id === teacherId);
    },
  });

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    rows.forEach((r) => {
      const s = r.attendance_sessions?.class_schedules?.subjects;
      if (s) m.set(s.code, `${s.code} · ${s.name}`);
    });
    return Array.from(m.entries());
  }, [rows]);

  const filtered = useMemo(() => rows.filter((r) => {
    if (statusF !== "all" && r.status !== statusF) return false;
    const sched = r.attendance_sessions?.class_schedules;
    if (subjF !== "all" && sched?.subjects?.code !== subjF) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.students?.full_name ?? ""} ${r.students?.student_no ?? ""} ${sched?.sections?.name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [rows, statusF, subjF, search]);

  const summary = useMemo(() => {
    const present = filtered.filter((r) => r.status === "present").length;
    const late = filtered.filter((r) => r.status === "late").length;
    const absent = filtered.filter((r) => r.status === "absent").length;
    const total = filtered.length;
    const attended = present + late;
    const pct = total > 0 ? Math.round((attended / total) * 100) : 0;
    const uniqueStudents = new Set(filtered.map((r) => r.students?.student_no ?? r.students?.full_name)).size;
    return { present, late, absent, total, pct, uniqueStudents };
  }, [filtered]);

  const exportData = () => filtered.map((r) => ({
    Student: r.students?.full_name ?? "",
    StudentID: r.students?.student_no ?? "",
    Subject: r.attendance_sessions?.class_schedules?.subjects
      ? `${r.attendance_sessions.class_schedules.subjects.code} · ${r.attendance_sessions.class_schedules.subjects.name}`
      : "",
    Section: r.attendance_sessions?.class_schedules?.sections?.name ?? "",
    Date: r.check_in_at ? new Date(r.check_in_at).toLocaleDateString() : "",
    Time: r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString() : "",
    Status: r.status,
  }));

  return (
    <div>
      <PageHeader
        title="My Reports"
        description="Attendance summary and detailed records for your classes."
        action={
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={filtered.length === 0}>
                <Download className="mr-1.5 h-4 w-4" /> Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => downloadCsv("teacher-attendance.csv", exportData())}>CSV</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadXlsx("teacher-attendance.xlsx", exportData())}>Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadPdf("teacher-attendance.pdf", "My Attendance Report", exportData())}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Students" value={summary.uniqueStudents} />
        <StatCard label="Present" value={summary.present} />
        <StatCard label="Late" value={summary.late} />
        <StatCard label="Absent" value={summary.absent} />
        <StatCard label="Attendance %" value={`${summary.pct}%`} />
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search student, ID, section…" className="pl-9"
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
          Failed to load: {(error as Error).message}
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
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  <FileBarChart className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No records match your filters.
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
