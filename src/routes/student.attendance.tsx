import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/student/attendance")({
  component: StudentAttendancePage,
});

type Period = "all" | "daily" | "weekly" | "monthly";

function startOf(period: Period): Date | null {
  const d = new Date();
  if (period === "daily") { d.setHours(0, 0, 0, 0); return d; }
  if (period === "weekly") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  if (period === "monthly") return new Date(d.getFullYear(), d.getMonth(), 1);
  return null;
}

function StudentAttendancePage() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("all");
  const [subjectFilter, setSubjectFilter] = useState("all");

  const { data: student } = useQuery({
    queryKey: ["my-student", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("students").select("id").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["my-attendance-full", student?.id],
    enabled: !!student?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, check_in_at, check_out_at, attendance_sessions(opened_at, class_schedules(subject_id, subjects(code, name), teachers(full_name)))")
        .eq("student_id", student!.id)
        .order("check_in_at", { ascending: false, nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const subjects = useMemo(() => {
    const map = new Map<string, string>();
    records.forEach((r) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sched: any = r.attendance_sessions?.class_schedules;
      if (sched?.subject_id && sched.subjects) {
        map.set(sched.subject_id, `${sched.subjects.code} · ${sched.subjects.name}`);
      }
    });
    return Array.from(map, ([id, label]) => ({ id, label }));
  }, [records]);

  const filtered = useMemo(() => {
    const since = startOf(period);
    return records.filter((r) => {
      if (since && r.check_in_at && new Date(r.check_in_at) < since) return false;
      if (subjectFilter !== "all") {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sid = (r.attendance_sessions?.class_schedules as any)?.subject_id;
        if (sid !== subjectFilter) return false;
      }
      return true;
    });
  }, [records, period, subjectFilter]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const present = filtered.filter((r) => r.status === "present").length;
    const late = filtered.filter((r) => r.status === "late").length;
    const absent = filtered.filter((r) => r.status === "absent").length;
    return { total, present, late, absent, pct: total ? Math.round(((present + late) / total) * 100) : 0 };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Attendance history</h1>
        <p className="mt-1 text-sm text-muted-foreground">Filter by period or subject to review your record.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatBox label="Total" value={stats.total} />
        <StatBox label="Present" value={stats.present} tone="text-green-600" />
        <StatBox label="Late" value={stats.late} tone="text-yellow-600" />
        <StatBox label="Absent" value={stats.absent} tone="text-destructive" />
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Rate</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.pct}%</p>
            <Progress className="mt-2" value={stats.pct} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All time</SelectItem>
            <SelectItem value="daily">Today</SelectItem>
            <SelectItem value="weekly">This week</SelectItem>
            <SelectItem value="monthly">This month</SelectItem>
          </SelectContent>
        </Select>
        <Select value={subjectFilter} onValueChange={setSubjectFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All subjects</SelectItem>
            {subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Check-in</TableHead>
                  <TableHead>Check-out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No records.</TableCell></TableRow>
                ) : filtered.map((r) => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const sched: any = r.attendance_sessions?.class_schedules;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>{r.check_in_at ? new Date(r.check_in_at).toLocaleDateString() : "—"}</TableCell>
                      <TableCell>{sched?.subjects ? `${sched.subjects.code} · ${sched.subjects.name}` : "—"}</TableCell>
                      <TableCell>{sched?.teachers?.full_name ?? "—"}</TableCell>
                      <TableCell>{r.check_in_at ? new Date(r.check_in_at).toLocaleTimeString() : "—"}</TableCell>
                      <TableCell>{r.check_out_at ? new Date(r.check_out_at).toLocaleTimeString() : "—"}</TableCell>
                      <TableCell><Badge variant={r.status === "present" ? "default" : r.status === "late" ? "secondary" : "destructive"}>{r.status}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ label, value, tone = "" }: { label: string; value: number; tone?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent><p className={`text-2xl font-bold ${tone}`}>{value}</p></CardContent>
    </Card>
  );
}
