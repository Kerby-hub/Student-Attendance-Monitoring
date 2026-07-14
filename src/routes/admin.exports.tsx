import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ReportFilters, type FilterValue } from "@/components/admin/ReportFilters";
import { fetchAttendance } from "@/lib/reports/fetch";
import { tally, groupBy, weekRange, monthRange, fmtDate } from "@/lib/reports/aggregations";
import { downloadCsv, downloadXlsx, downloadPdf, type Row } from "@/lib/reports/exporters";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/admin/exports")({
  component: ExportCenter,
});

type ReportType = "attendance" | "daily" | "weekly" | "monthly" | "sms" | "audit";

function todayIso() { return new Date().toISOString().slice(0, 10); }

function ExportCenter() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const today = todayIso();
  const [type, setType] = useState<ReportType>("attendance");
  const [filters, setFilters] = useState<FilterValue>({
    from: today, to: today, teacherId: "", sectionId: "", studentId: "", academicYearId: "", semesterId: "",
  });

  const { data: rows = [], isFetching, error, refetch } = useQuery({
    queryKey: ["export-data", type, filters],
    queryFn: async (): Promise<Row[]> => {
      if (type === "attendance" || type === "daily" || type === "weekly" || type === "monthly") {
        // adjust filter range based on type
        let f = filters;
        if (type === "weekly") {
          const r = weekRange(filters.to || today);
          f = { ...filters, from: r.from, to: r.to };
        } else if (type === "monthly") {
          const r = monthRange((filters.to || today).slice(0, 7));
          f = { ...filters, from: r.from, to: r.to };
        } else if (type === "daily") {
          f = { ...filters, from: filters.to || today, to: filters.to || today };
        }
        const att = await fetchAttendance(f);

        if (type === "attendance") {
          return att.map((r) => ({
            date: r.date, time: r.time, student_no: r.student_no, student: r.student,
            program: r.program, subject: r.subject, section: r.section, teacher: r.teacher, status: r.status,
          }));
        }
        if (type === "daily") {
          const by = groupBy(att, (r) => r.section || "—");
          return Object.entries(by).map(([section, rs]) => {
            const t = tally(rs);
            return { date: f.from, section, total: t.total, present: t.present, late: t.late, absent: t.absent, attendance_pct: `${t.pct}%` };
          });
        }
        if (type === "weekly") {
          const days: string[] = [];
          for (let i = 0; i < 7; i++) { const d = new Date(f.from); d.setDate(d.getDate() + i); days.push(fmtDate(d)); }
          const by = groupBy(att, (r) => r.date);
          return days.map((d) => {
            const t = tally(by[d] ?? []);
            return { date: d, total: t.total, present: t.present, late: t.late, absent: t.absent, attendance_pct: `${t.pct}%` };
          });
        }
        // monthly per-student
        const by = groupBy(att, (r) => `${r.student_no}|${r.student}`);
        return Object.entries(by).map(([k, rs]) => {
          const [no, name] = k.split("|");
          const t = tally(rs);
          return { student_no: no, student: name, total: t.total, present: t.present, late: t.late, absent: t.absent, attendance_pct: `${t.pct}%` };
        });
      }
      if (type === "sms") {
        let q = (supabase as any).from("sms_logs").select("*").order("created_at", { ascending: false }).limit(5000);
        if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00`);
        if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
        const { data, error } = await q;
        if (error) throw error;
        return (data as any[]).map((l) => ({
          when: l.created_at, phone: l.phone, status: l.status, message: l.message,
        }));
      }
      // audit
      let q = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(5000);
      if (filters.from) q = q.gte("created_at", `${filters.from}T00:00:00`);
      if (filters.to) q = q.lte("created_at", `${filters.to}T23:59:59`);
      const { data, error } = await q;
      if (error) throw error;
      return (data as any[]).map((l) => ({
        when: l.created_at, actor: l.actor_id ?? "", action: l.action,
        entity: l.entity_type, entity_id: l.entity_id ?? "", metadata: JSON.stringify(l.metadata ?? {}),
      }));
    },
    enabled: false,
  });

  if (!isAdmin) return <Card><CardContent className="p-6">Admin access required.</CardContent></Card>;

  const filename = `${type}_${filters.from}_${filters.to}`;
  const title = `${type[0].toUpperCase()}${type.slice(1)} Report`;

  return (
    <div>
      <PageHeader title="Export Center" description="Pick a report type and format, then download." />

      <Card className="mb-4 shadow-[var(--shadow-card)]"><CardContent className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Report type</Label>
            <Select value={type} onValueChange={(v) => setType(v as ReportType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="attendance">Attendance — detailed</SelectItem>
                <SelectItem value="daily">Daily report (by section)</SelectItem>
                <SelectItem value="weekly">Weekly report (by day)</SelectItem>
                <SelectItem value="monthly">Monthly report (by student)</SelectItem>
                <SelectItem value="sms">SMS / notification logs</SelectItem>
                <SelectItem value="audit">Audit logs</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <ReportFilters value={filters} onChange={setFilters} />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Button variant="outline" onClick={() => refetch()}>
            {isFetching ? "Loading…" : `Preview${rows.length ? ` (${rows.length} rows)` : ""}`}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => { refetch().then(() => downloadCsv(`${filename}.csv`, rows)); }}>
              <Download className="mr-1.5 h-4 w-4" />CSV
            </Button>
            <Button variant="outline" onClick={() => { refetch().then(() => downloadXlsx(`${filename}.xlsx`, rows)); }}>
              <FileSpreadsheet className="mr-1.5 h-4 w-4" />Excel
            </Button>
            <Button variant="outline" onClick={() => { refetch().then(() => downloadPdf(`${filename}.pdf`, title, rows)); }}>
              <FileText className="mr-1.5 h-4 w-4" />PDF
            </Button>
          </div>
        </div>
        {error ? <p className="text-sm text-destructive">{(error as Error).message}</p> : null}
      </CardContent></Card>

      <Card><CardContent className="p-0 overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Click Preview to load data, then export.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground">
              <tr>{Object.keys(rows[0]).map((c) => <th key={c} className="p-2">{c}</th>)}</tr>
            </thead>
            <tbody>
              {rows.slice(0, 50).map((r, i) => (
                <tr key={i} className="border-t">
                  {Object.keys(rows[0]).map((c) => <td key={c} className="p-2">{String(r[c] ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 50 && <p className="p-2 text-xs text-muted-foreground">Showing first 50 — export downloads all {rows.length} rows.</p>}
      </CardContent></Card>
    </div>
  );
}
