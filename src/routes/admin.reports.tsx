import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/admin/reports")({
  component: ReportsPage,
});

function toCsv(rows: any[]) {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const head = cols.join(",");
  const body = rows.map((r) =>
    cols.map((c) => JSON.stringify(r[c] ?? "")).join(",")
  ).join("\n");
  return head + "\n" + body;
}

function download(name: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ["report-attendance", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(`
          id, status, check_in_at, check_out_at,
          students:students!attendance_records_student_id_fkey(full_name, student_no, program),
          attendance_sessions:attendance_sessions!attendance_records_session_id_fkey(
            schedule_id,
            class_schedules:class_schedules!attendance_sessions_schedule_id_fkey(
              subjects:subjects!class_schedules_subject_id_fkey(code, name),
              sections:sections!class_schedules_section_id_fkey(name)
            )
          )
        `)
        .gte("check_in_at", `${from}T00:00:00`)
        .lte("check_in_at", `${to}T23:59:59`)
        .order("check_in_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as any[];
    },
  });

  const flat = data.map((r) => ({
    date: r.check_in_at?.slice(0, 10) ?? "",
    time: r.check_in_at?.slice(11, 16) ?? "",
    student_no: r.students?.student_no ?? "",
    student: r.students?.full_name ?? "",
    program: r.students?.program ?? "",
    subject: r.attendance_sessions?.class_schedules?.subjects?.code ?? "",
    subject_name: r.attendance_sessions?.class_schedules?.subjects?.name ?? "",
    section: r.attendance_sessions?.class_schedules?.sections?.name ?? "",
    status: r.status,
  }));

  return (
    <div>
      <PageHeader title="Reports" description="Attendance reports with CSV export. PDF & Excel coming soon." />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end">
        <div><Label>From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><Label>To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Button variant="outline" onClick={() => refetch()}>Refresh</Button>
        <Button onClick={() => download(`attendance_${from}_${to}.csv`, toCsv(flat))} disabled={!flat.length}>
          <Download className="mr-1.5 h-4 w-4" /> CSV
        </Button>
        <Button variant="outline" onClick={() => toast.info("PDF/Excel export coming soon.")}>
          <FileText className="mr-1.5 h-4 w-4" /> PDF/Excel
        </Button>
      </div>

      <div className="rounded-lg border bg-card p-4 shadow-[var(--shadow-card)]">
        <p className="mb-2 text-sm text-muted-foreground">{isLoading ? "Loading…" : `${flat.length} records`}</p>
        {flat.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2">Date</th><th>Time</th><th>Student #</th><th>Name</th>
                  <th>Subject</th><th>Section</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {flat.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2">{r.date}</td><td>{r.time}</td>
                    <td className="font-mono text-xs">{r.student_no}</td><td>{r.student}</td>
                    <td>{r.subject}</td><td>{r.section}</td>
                    <td className="capitalize">{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {flat.length > 100 && <p className="mt-2 text-xs text-muted-foreground">Showing first 100 — export CSV for full list.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
