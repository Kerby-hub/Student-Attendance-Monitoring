import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Users, GraduationCap, BookOpen, CalendarClock, UserCheck, CheckCircle2, Clock, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

const COUNTS = [
  { key: "teachers", label: "Teachers", icon: Users, to: "/admin/teachers" },
  { key: "students", label: "Total Students", icon: GraduationCap, to: "/admin/students" },
  { key: "subjects", label: "Subjects", icon: BookOpen, to: "/admin/subjects" },
  { key: "class_schedules", label: "Schedules", icon: CalendarClock, to: "/admin/schedules" },
] as const;

function AdminDashboardPage() {
  const { data: counts } = useQuery({
    queryKey: ["admin-counts"],
    queryFn: async () => {
      const totals = await Promise.all(
        COUNTS.map((c) => supabase.from(c.key).select("*", { count: "exact", head: true }).then((r) => r.count ?? 0)),
      );
      const { count: active } = await supabase
        .from("students").select("*", { count: "exact", head: true }).eq("status", "active");
      const out = Object.fromEntries(COUNTS.map((c, i) => [c.key, totals[i]])) as Record<string, number>;
      out.active_students = active ?? 0;
      return out;
    },
  });

  const { data: attendance = [] } = useQuery({
    queryKey: ["admin-attendance-30d"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("attendance_records").select("status, check_in_at")
        .gte("check_in_at", since.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const attStats = useMemo(() => {
    const total = attendance.length;
    const present = attendance.filter((a) => a.status === "present").length;
    const late = attendance.filter((a) => a.status === "late").length;
    const absent = attendance.filter((a) => a.status === "absent").length;
    return { total, present, late, absent, pct: total ? Math.round(((present + late) / total) * 100) : 0 };
  }, [attendance]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Overview of your attendance monitoring system.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COUNTS.map((c) => (
          <Link key={c.key} to={c.to}>
            <Card className="transition hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent><div className="text-3xl font-bold">{counts?.[c.key] ?? "—"}</div></CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Students</CardTitle>
            <UserCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{counts?.active_students ?? "—"}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              of {counts?.students ?? "—"} total registered
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Attendance summary <span className="ml-2 text-xs font-normal text-muted-foreground">last 30 days</span></CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <Mini icon={CheckCircle2} label="Present" value={attStats.present} tone="text-green-600" />
              <Mini icon={Clock} label="Late" value={attStats.late} tone="text-yellow-600" />
              <Mini icon={XCircle} label="Absent" value={attStats.absent} tone="text-destructive" />
            </div>
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-muted-foreground">Attendance rate</span>
                <span className="font-semibold">{attStats.pct}%</span>
              </div>
              <Progress value={attStats.pct} />
              <p className="mt-1 text-xs text-muted-foreground">{attStats.total} records analyzed.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Mini({ icon: Icon, label, value, tone }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{label}</div>
      <p className={`mt-1 text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}
