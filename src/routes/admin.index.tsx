import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users, GraduationCap, BookOpen, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboardPage,
});

const COUNTS = [
  { key: "teachers", label: "Teachers", icon: Users, to: "/admin/teachers" },
  { key: "students", label: "Students", icon: GraduationCap, to: "/admin/students" },
  { key: "subjects", label: "Subjects", icon: BookOpen, to: "/admin/subjects" },
  { key: "class_schedules", label: "Schedules", icon: CalendarClock, to: "/admin/schedules" },
] as const;

function AdminDashboardPage() {
  const { data } = useQuery({
    queryKey: ["admin-counts"],
    queryFn: async () => {
      const results = await Promise.all(
        COUNTS.map((c) =>
          supabase.from(c.key).select("*", { count: "exact", head: true }).then((r) => r.count ?? 0),
        ),
      );
      return Object.fromEntries(COUNTS.map((c, i) => [c.key, results[i]])) as Record<string, number>;
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Overview of your attendance monitoring system.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {COUNTS.map((c) => (
          <Link key={c.key} to={c.to}>
            <Card className="transition hover:shadow-md">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
                <c.icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold">{data?.[c.key] ?? "—"}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Phase 1 modules available</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <p>✅ Departments, Subjects, Sections CRUD</p>
          <p>✅ Teacher management with assignments</p>
          <p>✅ Class schedule management</p>
          <p className="text-muted-foreground">⏳ Students — next phase</p>
          <p className="text-muted-foreground">⏳ Attendance / QR / Geofence — next phase</p>
          <p className="text-muted-foreground">⏳ Reports / SMS / Calendar — next phase</p>
        </CardContent>
      </Card>
    </div>
  );
}
