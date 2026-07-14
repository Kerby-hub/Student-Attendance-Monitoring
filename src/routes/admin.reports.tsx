import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText, Search, Users, ClipboardList } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportFilters, type FilterValue } from "@/components/admin/ReportFilters";
import { fetchAttendance } from "@/lib/reports/fetch";
import { tally, groupBy, weekRange, monthRange, fmtDate } from "@/lib/reports/aggregations";
import { downloadCsv, downloadXlsx, downloadPdf, type Row } from "@/lib/reports/exporters";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/reports")({
  component: ReportsPage,
});

function todayIso() { return new Date().toISOString().slice(0, 10); }

function ExportButtons({ filename, title, rows }: { filename: string; title: string; rows: Row[] }) {
  const disabled = !rows.length;
  return (
    <div className="flex flex-wrap gap-2">
      <Button size="sm" onClick={() => downloadCsv(`${filename}.csv`, rows)} disabled={disabled}>
        <Download className="mr-1.5 h-4 w-4" />CSV
      </Button>
      <Button size="sm" variant="outline" onClick={() => downloadXlsx(`${filename}.xlsx`, rows)} disabled={disabled}>
        <FileSpreadsheet className="mr-1.5 h-4 w-4" />Excel
      </Button>
      <Button size="sm" variant="outline" onClick={() => downloadPdf(`${filename}.pdf`, title, rows)} disabled={disabled}>
        <FileText className="mr-1.5 h-4 w-4" />PDF
      </Button>
    </div>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

function ReportsPage() {
  const [tab, setTab] = useState("detailed");
  const today = todayIso();
  const [filters, setFilters] = useState<FilterValue>({
    from: today, to: today, teacherId: "", sectionId: "", studentId: "", academicYearId: "", semesterId: "",
  });

  return (
    <div>
      <PageHeader title="Reports" description="Attendance analytics with CSV, Excel, and PDF export." />

      <Card className="mb-4 shadow-[var(--shadow-card)]"><CardContent className="p-4">
        <ReportFilters value={filters} onChange={setFilters} />
      </CardContent></Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3 flex w-full flex-wrap sm:w-auto sm:inline-flex">
          <TabsTrigger value="detailed">Detailed</TabsTrigger>
          <TabsTrigger value="logs"><ClipboardList className="mr-1.5 h-3.5 w-3.5" />Logs</TabsTrigger>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
          <TabsTrigger value="users"><Users className="mr-1.5 h-3.5 w-3.5" />Users</TabsTrigger>
        </TabsList>
        <TabsContent value="detailed"><DetailedView filters={filters} /></TabsContent>
        <TabsContent value="logs"><LogsView filters={filters} /></TabsContent>
        <TabsContent value="daily"><DailyView baseFilters={filters} /></TabsContent>
        <TabsContent value="weekly"><WeeklyView baseFilters={filters} /></TabsContent>
        <TabsContent value="monthly"><MonthlyView baseFilters={filters} /></TabsContent>
        <TabsContent value="users"><UsersReport /></TabsContent>
      </Tabs>
    </div>
  );
}

function useAttendance(filters: FilterValue) {
  return useQuery({
    queryKey: ["attendance-report", filters],
    queryFn: () => fetchAttendance(filters),
  });
}

function DetailedView({ filters }: { filters: FilterValue }) {
  const { data = [], isLoading, error } = useAttendance(filters);
  const t = useMemo(() => tally(data), [data]);

  const exportRows: Row[] = data.map((r) => ({
    date: r.date, time: r.time, student_no: r.student_no, student: r.student,
    program: r.program, subject: r.subject, section: r.section, teacher: r.teacher, status: r.status,
  }));

  return (
    <div className="space-y-4">
      {error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill label="Total" value={t.total} />
        <StatPill label="Present" value={t.present} tone="text-emerald-600" />
        <StatPill label="Late" value={t.late} tone="text-amber-600" />
        <StatPill label="Absent" value={t.absent} tone="text-destructive" />
        <StatPill label="Attendance %" value={`${t.pct}%`} tone="text-primary" />
      </div>
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{isLoading ? "Loading…" : `${data.length} records`}</p>
        <ExportButtons filename={`attendance_${filters.from}_${filters.to}`} title="Attendance Report" rows={exportRows} />
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Date</th><th className="p-2">Time</th>
              <th className="p-2">Student</th><th className="p-2">Subject</th>
              <th className="p-2">Section</th><th className="p-2">Teacher</th>
              <th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data.slice(0, 200).map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.date}</td>
                <td className="p-2">{r.time}</td>
                <td className="p-2">{r.student} <span className="text-xs text-muted-foreground">({r.student_no})</span></td>
                <td className="p-2">{r.subject}</td>
                <td className="p-2">{r.section}</td>
                <td className="p-2">{r.teacher}</td>
                <td className="p-2 capitalize">{r.status}</td>
              </tr>
            ))}
            {!isLoading && data.length === 0 && (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No records.</td></tr>
            )}
          </tbody>
        </table>
        {data.length > 200 && (
          <p className="p-2 text-xs text-muted-foreground">Showing first 200 — export for full list.</p>
        )}
      </CardContent></Card>
    </div>
  );
}

function DailyView({ baseFilters }: { baseFilters: FilterValue }) {
  const [date, setDate] = useState(baseFilters.to || todayIso());
  const filters = { ...baseFilters, from: date, to: date };
  const { data = [], isLoading } = useAttendance(filters);

  const bySection = groupBy(data, (r) => r.section || "—");
  const rows: Row[] = Object.entries(bySection).map(([section, rs]) => {
    const t = tally(rs);
    return { date, section, total: t.total, present: t.present, late: t.late, absent: t.absent, attendance_pct: `${t.pct}%` };
  });
  const overall = tally(data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <ExportButtons filename={`daily_${date}`} title={`Daily Report — ${date}`} rows={rows} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill label="Total" value={overall.total} />
        <StatPill label="Present" value={overall.present} tone="text-emerald-600" />
        <StatPill label="Late" value={overall.late} tone="text-amber-600" />
        <StatPill label="Absent" value={overall.absent} tone="text-destructive" />
        <StatPill label="Attendance %" value={`${overall.pct}%`} tone="text-primary" />
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Section</th><th className="p-2">Total</th><th className="p-2">Present</th><th className="p-2">Late</th><th className="p-2">Absent</th><th className="p-2">%</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No records.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-medium">{String(r.section)}</td>
                <td className="p-2">{r.total}</td>
                <td className="p-2 text-emerald-600">{r.present}</td>
                <td className="p-2 text-amber-600">{r.late}</td>
                <td className="p-2 text-destructive">{r.absent}</td>
                <td className="p-2 font-semibold">{r.attendance_pct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function WeeklyView({ baseFilters }: { baseFilters: FilterValue }) {
  const [anchor, setAnchor] = useState(baseFilters.to || todayIso());
  const { from, to } = weekRange(anchor);
  const filters = { ...baseFilters, from, to };
  const { data = [], isLoading } = useAttendance(filters);

  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(from); d.setDate(d.getDate() + i);
    days.push(fmtDate(d));
  }
  const byDay = groupBy(data, (r) => r.date);
  const rows: Row[] = days.map((d) => {
    const t = tally(byDay[d] ?? []);
    return { date: d, total: t.total, present: t.present, late: t.late, absent: t.absent, attendance_pct: `${t.pct}%` };
  });
  const overall = tally(data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>Any day in week</Label><Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} /></div>
        <p className="text-sm text-muted-foreground self-center">{from} → {to}</p>
        <ExportButtons filename={`weekly_${from}_${to}`} title={`Weekly Report — ${from} to ${to}`} rows={rows} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill label="Total" value={overall.total} />
        <StatPill label="Present" value={overall.present} tone="text-emerald-600" />
        <StatPill label="Late" value={overall.late} tone="text-amber-600" />
        <StatPill label="Absent" value={overall.absent} tone="text-destructive" />
        <StatPill label="Attendance %" value={`${overall.pct}%`} tone="text-primary" />
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Date</th><th className="p-2">Total</th><th className="p-2">Present</th><th className="p-2">Late</th><th className="p-2">Absent</th><th className="p-2">%</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-medium">{String(r.date)}</td>
                <td className="p-2">{r.total}</td>
                <td className="p-2 text-emerald-600">{r.present}</td>
                <td className="p-2 text-amber-600">{r.late}</td>
                <td className="p-2 text-destructive">{r.absent}</td>
                <td className="p-2 font-semibold">{r.attendance_pct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

function MonthlyView({ baseFilters }: { baseFilters: FilterValue }) {
  const today = todayIso();
  const [month, setMonth] = useState(today.slice(0, 7));
  const { from, to } = monthRange(month);
  const filters = { ...baseFilters, from, to };
  const { data = [], isLoading } = useAttendance(filters);

  const byStudent = groupBy(data, (r) => `${r.student_no}|${r.student}`);
  const rows: Row[] = Object.entries(byStudent).map(([k, rs]) => {
    const [no, name] = k.split("|");
    const t = tally(rs);
    return { student_no: no, student: name, total: t.total, present: t.present, late: t.late, absent: t.absent, attendance_pct: `${t.pct}%` };
  }).sort((a, b) => String(a.student).localeCompare(String(b.student)));
  const overall = tally(data);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div><Label>Month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
        <p className="text-sm text-muted-foreground self-center">{from} → {to}</p>
        <ExportButtons filename={`monthly_${month}`} title={`Monthly Report — ${month}`} rows={rows} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill label="Total" value={overall.total} />
        <StatPill label="Present" value={overall.present} tone="text-emerald-600" />
        <StatPill label="Late" value={overall.late} tone="text-amber-600" />
        <StatPill label="Absent" value={overall.absent} tone="text-destructive" />
        <StatPill label="Attendance %" value={`${overall.pct}%`} tone="text-primary" />
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-2">Student #</th><th className="p-2">Name</th><th className="p-2">Total</th><th className="p-2">Present</th><th className="p-2">Late</th><th className="p-2">Absent</th><th className="p-2">%</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No records.</td></tr>
            ) : rows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono text-xs">{String(r.student_no)}</td>
                <td className="p-2 font-medium">{String(r.student)}</td>
                <td className="p-2">{r.total}</td>
                <td className="p-2 text-emerald-600">{r.present}</td>
                <td className="p-2 text-amber-600">{r.late}</td>
                <td className="p-2 text-destructive">{r.absent}</td>
                <td className="p-2 font-semibold">{r.attendance_pct}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
    </div>
  );
}

// ───────── Logs View (detailed attendance audit trail) ─────────
function LogsView({ filters }: { filters: FilterValue }) {
  const { data = [], isLoading, error } = useAttendance(filters);
  const [status, setStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  const filtered = useMemo(() => {
    return data.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.student.toLowerCase().includes(q) &&
          !r.student_no.toLowerCase().includes(q) &&
          !r.subject.toLowerCase().includes(q) &&
          !r.teacher.toLowerCase().includes(q)
        ) return false;
      }
      return true;
    });
  }, [data, status, search]);

  const t = useMemo(() => tally(filtered), [filtered]);
  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const exportRows: Row[] = filtered.map((r) => ({
    date: r.date, time: r.time, student_no: r.student_no, student: r.student,
    program: r.program, subject: r.subject, subject_name: r.subject_name,
    section: r.section, teacher: r.teacher, status: r.status,
  }));

  return (
    <div className="space-y-4">
      {error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatPill label="Total logs" value={t.total} />
        <StatPill label="Present" value={t.present} tone="text-emerald-600" />
        <StatPill label="Late" value={t.late} tone="text-amber-600" />
        <StatPill label="Absent" value={t.absent} tone="text-destructive" />
        <StatPill label="Rate" value={`${t.pct}%`} tone="text-primary" />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search student, subject, teacher…" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <div>
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="late">Late</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
              <SelectItem value="excused">Excused</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <ExportButtons filename={`attendance_logs_${filters.from}_${filters.to}`} title="Attendance Logs" rows={exportRows} />
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Date</th><th className="p-2">Time</th>
              <th className="p-2">Student</th><th className="p-2">Program</th>
              <th className="p-2">Subject</th><th className="p-2">Section</th>
              <th className="p-2">Teacher</th><th className="p-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No logs match your filters.</td></tr>
            ) : pageRows.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="p-2">{r.date}</td>
                <td className="p-2 font-mono text-xs">{r.time}</td>
                <td className="p-2">
                  <div className="font-medium">{r.student}</div>
                  <div className="text-xs text-muted-foreground">{r.student_no}</div>
                </td>
                <td className="p-2 text-xs">{r.program || "—"}</td>
                <td className="p-2">
                  <div className="font-medium">{r.subject || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.subject_name}</div>
                </td>
                <td className="p-2">{r.section || "—"}</td>
                <td className="p-2">{r.teacher || "—"}</td>
                <td className="p-2">
                  <Badge variant={r.status === "present" ? "default" : r.status === "late" ? "secondary" : "destructive"} className="capitalize">
                    {r.status}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page + 1} of {totalPages} · {filtered.length} logs
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────── Users Report (full list of admins/teachers/students) ─────────
type UserReportRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  role: "admin" | "teacher" | "student" | null;
  has_device: boolean;
};

function UsersReport() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["user-report"],
    queryFn: async (): Promise<UserReportRow[]> => {
      const [{ data: profiles, error: pe }, { data: roleRows }, { data: devices }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name, status, must_change_password, created_at, updated_at").order("created_at", { ascending: false }),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("device_registrations").select("user_id").eq("status", "active"),
      ]);
      if (pe) throw pe;
      const roleMap = new Map<string, UserReportRow["role"]>();
      (roleRows ?? []).forEach((r: { user_id: string; role: UserReportRow["role"] }) => roleMap.set(r.user_id, r.role));
      const deviceSet = new Set((devices ?? []).map((d: { user_id: string }) => d.user_id));
      return (profiles ?? []).map((p) => ({
        ...p,
        role: roleMap.get(p.id) ?? null,
        has_device: deviceSet.has(p.id),
      })) as UserReportRow[];
    },
  });

  const filtered = useMemo(() => {
    return rows.filter((u) => {
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (from && new Date(u.created_at) < new Date(`${from}T00:00:00`)) return false;
      if (to && new Date(u.created_at) > new Date(`${to}T23:59:59`)) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!u.email.toLowerCase().includes(q) && !(u.full_name ?? "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [rows, roleFilter, statusFilter, search, from, to]);

  const counts = useMemo(() => ({
    total: rows.length,
    students: rows.filter((u) => u.role === "student").length,
    teachers: rows.filter((u) => u.role === "teacher").length,
    admins: rows.filter((u) => u.role === "admin").length,
    active: rows.filter((u) => u.status === "active").length,
    norole: rows.filter((u) => !u.role).length,
  }), [rows]);

  const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const exportRows: Row[] = filtered.map((u) => ({
    full_name: u.full_name ?? "",
    email: u.email,
    role: u.role ?? "—",
    status: u.status,
    must_change_password: u.must_change_password ? "yes" : "no",
    device_registered: u.has_device ? "yes" : "no",
    created_at: u.created_at,
    updated_at: u.updated_at,
  }));

  return (
    <div className="space-y-4">
      {error ? (
        <Card><CardContent className="p-4 text-sm text-destructive">{(error as Error).message}</CardContent></Card>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <StatPill label="Total" value={counts.total} />
        <StatPill label="Students" value={counts.students} tone="text-primary" />
        <StatPill label="Teachers" value={counts.teachers} tone="text-emerald-600" />
        <StatPill label="Admins" value={counts.admins} tone="text-amber-600" />
        <StatPill label="Active" value={counts.active} tone="text-emerald-600" />
        <StatPill label="No role" value={counts.norole} tone="text-destructive" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="relative lg:col-span-2">
          <Search className="pointer-events-none absolute left-3 top-9 h-4 w-4 text-muted-foreground" />
          <Label>Search</Label>
          <Input placeholder="Name or email…" className="pl-9" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        </div>
        <div>
          <Label>Role</Label>
          <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v); setPage(0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="teacher">Teacher</SelectItem>
              <SelectItem value="student">Student</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Status</Label>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        </div>
      </div>
      <div className="flex justify-end">
        <ExportButtons filename={`users_${new Date().toISOString().slice(0, 10)}`} title="User List Report" rows={exportRows} />
      </div>
      <Card><CardContent className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-2">Name</th><th className="p-2">Email</th>
              <th className="p-2">Role</th><th className="p-2">Status</th>
              <th className="p-2">Device</th><th className="p-2">Must change pwd</th>
              <th className="p-2">Created</th><th className="p-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading…</td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No users match your filters.</td></tr>
            ) : pageRows.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2 font-medium">{u.full_name || "—"}</td>
                <td className="p-2 text-xs text-muted-foreground">{u.email}</td>
                <td className="p-2"><Badge variant="outline" className="capitalize">{u.role ?? "—"}</Badge></td>
                <td className="p-2">
                  <Badge variant={u.status === "active" ? "default" : "secondary"} className="capitalize">{u.status}</Badge>
                </td>
                <td className="p-2">{u.has_device ? <Badge variant="outline">Registered</Badge> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="p-2">{u.must_change_password ? <Badge variant="outline">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}</td>
                <td className="p-2 text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="p-2 text-xs">{new Date(u.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent></Card>
      {filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <p className="text-muted-foreground">Page {page + 1} of {totalPages} · {filtered.length} users</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
