import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import {
  Users, GraduationCap, BookOpen, CalendarClock,
  CheckCircle2, Clock, XCircle, Radio, Smartphone, Percent,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/StatCard";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

const PIE_COLORS = ["var(--success)", "var(--warning)", "var(--destructive)"];

const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  boxShadow: "var(--shadow-card)",
  fontSize: 12,
} as const;
const CHART_TOOLTIP_LABEL = { color: "var(--foreground)", fontWeight: 600 } as const;
const CHART_TOOLTIP_ITEM = { color: "var(--popover-foreground)" } as const;


const COUNTS = [
  { key: "teachers", label: "Teachers", icon: Users, to: "/admin/teachers" },
  { key: "students", label: "Students", icon: GraduationCap, to: "/admin/students" },
  { key: "subjects", label: "Subjects", icon: BookOpen, to: "/admin/subjects" },
  { key: "class_schedules", label: "Schedules", icon: CalendarClock, to: "/admin/schedules" },
] as const;

function todayRangeISO() {
  const start = new Date(); start.setHours(0,0,0,0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  return [start.toISOString(), end.toISOString()] as const;
}

function AdminDashboardPage() {
  const { data: counts } = useQuery({
    queryKey: ["admin-counts"],
    queryFn: async () => {
      const totals = await Promise.all(
        COUNTS.map((c) => supabase.from(c.key).select("*", { count: "exact", head: true }).then((r) => r.count ?? 0)),
      );
      const out = Object.fromEntries(COUNTS.map((c, i) => [c.key, totals[i]])) as Record<string, number>;
      return out;
    },
  });

  const { data: activeSessions = 0 } = useQuery({
    queryKey: ["admin-active-sessions"],
    queryFn: async () => {
      const { count } = await supabase.from("attendance_sessions")
        .select("*", { count: "exact", head: true }).in("status", ["open","waiting"]);
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

  const { data: registeredDevices = 0 } = useQuery({
    queryKey: ["admin-devices-active"],
    queryFn: async () => {
      const { count } = await supabase.from("device_registrations")
        .select("*", { count: "exact", head: true }).eq("status", "active");
      return count ?? 0;
    },
  });

  const { data: sessionsToday = 0 } = useQuery({
    queryKey: ["admin-sessions-today"],
    queryFn: async () => {
      const [from, to] = todayRangeISO();
      const { count } = await supabase.from("attendance_sessions")
        .select("*", { count: "exact", head: true })
        .gte("created_at", from).lt("created_at", to);
      return count ?? 0;
    },
    refetchInterval: 60000,
  });

  const { data: pendingDevices = 0 } = useQuery({
    queryKey: ["admin-devices-pending"],
    queryFn: async () => {
      const { count } = await supabase.from("device_registrations")
        .select("*", { count: "exact", head: true }).eq("status", "pending");
      return count ?? 0;
    },
  });



  const { data: today = [] } = useQuery({
    queryKey: ["admin-today"],
    queryFn: async () => {
      const [from, to] = todayRangeISO();
      const { data, error } = await supabase
        .from("attendance_records").select("status")
        .gte("created_at", from).lt("created_at", to);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  const todayStats = useMemo(() => ({
    present: today.filter((r) => r.status === "present").length,
    late: today.filter((r) => r.status === "late").length,
    absent: today.filter((r) => r.status === "absent").length,
  }), [today]);

  const { data: monthly = [] } = useQuery({
    queryKey: ["admin-attendance-90d"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 90);
      const { data, error } = await supabase
        .from("attendance_records").select("status, created_at")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  const monthlyTrend = useMemo(() => {
    const months = new Map<string, { name: string; present: number; late: number; absent: number }>();
    for (let i = 2; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i); d.setDate(1);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      months.set(k, { name: d.toLocaleDateString(undefined, { month: "short" }), present: 0, late: 0, absent: 0 });
    }
    monthly.forEach((r) => {
      const d = new Date(r.created_at);
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
      const m = months.get(k); if (!m) return;
      if (r.status === "present") m.present++;
      else if (r.status === "late") m.late++;
      else if (r.status === "absent") m.absent++;
    });
    return Array.from(months.values());
  }, [monthly]);

  const dailyTrend = useMemo(() => {
    const days = new Map<string, { name: string; present: number; late: number; absent: number }>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
      const k = d.toISOString().slice(0,10);
      days.set(k, { name: `${d.getMonth()+1}/${d.getDate()}`, present: 0, late: 0, absent: 0 });
    }
    monthly.forEach((r) => {
      const k = new Date(r.created_at).toISOString().slice(0,10);
      const day = days.get(k); if (!day) return;
      if (r.status === "present") day.present++;
      else if (r.status === "late") day.late++;
      else if (r.status === "absent") day.absent++;
    });
    return Array.from(days.values());
  }, [monthly]);

  const { data: bySubject = [] } = useQuery({
    queryKey: ["admin-by-subject"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("attendance_records")
        .select("status, attendance_sessions(class_schedules(subjects(code)))")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      const map = new Map<string, { name: string; present: number; total: number }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((r: any) => {
        const code = r.attendance_sessions?.class_schedules?.subjects?.code ?? "—";
        const m = map.get(code) ?? { name: code, present: 0, total: 0 };
        m.total++;
        if (r.status === "present" || r.status === "late") m.present++;
        map.set(code, m);
      });
      return Array.from(map.values()).map((m) => ({ name: m.name, rate: Math.round((m.present / m.total) * 100) })).slice(0, 8);
    },
  });

  const { data: bySection = [] } = useQuery({
    queryKey: ["admin-by-section"],
    queryFn: async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { data, error } = await supabase
        .from("attendance_records")
        .select("status, students(sections(name))")
        .gte("created_at", since.toISOString());
      if (error) throw error;
      const map = new Map<string, { name: string; value: number }>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).forEach((r: any) => {
        const name = r.students?.sections?.name ?? "—";
        const m = map.get(name) ?? { name, value: 0 };
        m.value++; map.set(name, m);
      });
      return Array.from(map.values()).sort((a,b) => b.value - a.value).slice(0, 8);
    },
  });

  const distribution = useMemo(() => ([
    { name: "Present", value: monthly.filter((r) => r.status === "present").length },
    { name: "Late", value: monthly.filter((r) => r.status === "late").length },
    { name: "Absent", value: monthly.filter((r) => r.status === "absent").length },
  ]), [monthly]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real-time overview of attendance across the institution.</p>
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Radio} label="Active Sessions" value={activeSessions} tone="primary" />
        <StatCard icon={CheckCircle2} label="Present Today" value={todayStats.present} tone="success" />
        <StatCard icon={Clock} label="Late Today" value={todayStats.late} tone="warning" />
        <StatCard icon={XCircle} label="Absent Today" value={todayStats.absent} tone="destructive" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={Smartphone} label="Registered Devices" value={registeredDevices} tone="info" />
        <StatCard
          icon={Percent}
          label="Attendance Rate (today)"
          value={`${
            todayStats.present + todayStats.late + todayStats.absent === 0
              ? 0
              : Math.round(((todayStats.present + todayStats.late) / (todayStats.present + todayStats.late + todayStats.absent)) * 100)
          }%`}
          tone="success"
        />
        <StatCard icon={CalendarClock} label="Sessions Today" value={sessionsToday} tone="primary" />
        <StatCard icon={Smartphone} label="Pending Device Approvals" value={pendingDevices} tone="warning" />

      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Monthly attendance trend</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={monthlyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL} itemStyle={CHART_TOOLTIP_ITEM} cursor={{ fill: "var(--accent)", opacity: 0.25 }} />
                <Legend />
                <Line type="monotone" dataKey="present" stroke="var(--success)" strokeWidth={2} />
                <Line type="monotone" dataKey="late" stroke="var(--warning)" strokeWidth={2} />
                <Line type="monotone" dataKey="absent" stroke="var(--destructive)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Daily attendance (last 14 days)</CardTitle></CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL} itemStyle={CHART_TOOLTIP_ITEM} cursor={{ fill: "var(--accent)", opacity: 0.25 }} />
                <Legend />
                <Bar dataKey="present" stackId="a" fill="var(--success)" />
                <Bar dataKey="late" stackId="a" fill="var(--warning)" />
                <Bar dataKey="absent" stackId="a" fill="var(--destructive)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Attendance rate by subject (30d)</CardTitle></CardHeader>
          <CardContent className="h-72">
            {bySubject.length === 0 ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bySubject} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" domain={[0, 100]} className="text-xs" />
                  <YAxis dataKey="name" type="category" className="text-xs" width={70} />
                  <Tooltip formatter={(v) => `${v}%`} contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL} itemStyle={CHART_TOOLTIP_ITEM} cursor={{ fill: "var(--accent)", opacity: 0.25 }} />
                  <Bar dataKey="rate" fill="var(--primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Status distribution</CardTitle></CardHeader>
          <CardContent className="h-72">
            {distribution.every((d) => d.value === 0) ? (
              <EmptyChart />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={distribution} dataKey="value" nameKey="name" outerRadius={80} label>
                    {distribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Records by section (30d)</CardTitle></CardHeader>
        <CardContent className="h-72">
          {bySection.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bySection}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} labelStyle={CHART_TOOLTIP_LABEL} itemStyle={CHART_TOOLTIP_ITEM} cursor={{ fill: "var(--accent)", opacity: 0.25 }} />
                <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


function EmptyChart() {
  return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No data in the selected range.</div>;
}
