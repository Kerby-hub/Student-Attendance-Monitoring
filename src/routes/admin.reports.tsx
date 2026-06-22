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
    from: today, to: today, teacherId: "", sectionId: "", studentId: "",
  });

  return (
    <div>
      <PageHeader title="Reports" description="Attendance analytics with CSV, Excel, and PDF export." />

      <Card className="mb-4 shadow-[var(--shadow-card)]"><CardContent className="p-4">
        <ReportFilters value={filters} onChange={setFilters} />
      </CardContent></Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-3 grid w-full grid-cols-4 sm:w-auto sm:inline-grid">
          <TabsTrigger value="detailed">Detailed</TabsTrigger>
          <TabsTrigger value="daily">Daily</TabsTrigger>
          <TabsTrigger value="weekly">Weekly</TabsTrigger>
          <TabsTrigger value="monthly">Monthly</TabsTrigger>
        </TabsList>
        <TabsContent value="detailed"><DetailedView filters={filters} /></TabsContent>
        <TabsContent value="daily"><DailyView baseFilters={filters} /></TabsContent>
        <TabsContent value="weekly"><WeeklyView baseFilters={filters} /></TabsContent>
        <TabsContent value="monthly"><MonthlyView baseFilters={filters} /></TabsContent>
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
