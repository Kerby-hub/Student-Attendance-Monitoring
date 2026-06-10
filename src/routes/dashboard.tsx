import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, ClipboardCheck, BookOpen, Settings } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGuard } from "@/components/RoleGuard";
import { NavHeader } from "@/components/NavHeader";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  ),
});

function DashboardPage() {
  const { profile, roles } = useAuth();
  const greeting = profile?.full_name?.split(" ")[0] || "there";

  return (
    <div className="min-h-screen bg-background" style={{ background: "var(--gradient-subtle)" }}>
      <NavHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <div className="mb-8">
          <p className="text-sm font-medium text-primary">Authentication Module</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Welcome back, {greeting} 👋
          </h1>
          <p className="mt-2 text-muted-foreground">
            You're signed in with role(s): <span className="font-semibold capitalize text-foreground">{roles.join(", ") || "none"}</span>
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <RoleGuard allowedRoles={["admin"]}>
            <FeatureCard
              icon={<Settings className="h-5 w-5" />}
              title="Admin tools"
              description="Manage users, roles, and system settings."
              to="/admin"
              badge="Admin only"
            />
          </RoleGuard>

          <RoleGuard allowedRoles={["admin", "teacher"]}>
            <FeatureCard
              icon={<ClipboardCheck className="h-5 w-5" />}
              title="Teacher portal"
              description="Take attendance and manage classes."
              to="/teacher"
              badge="Teacher / Admin"
            />
          </RoleGuard>

          <RoleGuard allowedRoles={["admin", "teacher", "student"]}>
            <FeatureCard
              icon={<BookOpen className="h-5 w-5" />}
              title="Student area"
              description="View your attendance and schedule."
              to="/student"
              badge="All roles"
            />
          </RoleGuard>

          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Your profile"
            description={profile?.email || ""}
            to="/dashboard"
            badge="You"
          />
        </div>

        <div className="mt-10 rounded-2xl border border-dashed border-border bg-card p-6">
          <h2 className="text-lg font-semibold">Next steps</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Only the Authentication module is built. Future modules (Student Management, Attendance,
            Geofencing, Reports, SMS, Calendar, Statistics, Administration) will appear here.
          </p>
        </div>
      </main>
    </div>
  );
}

function FeatureCard({
  icon, title, description, to, badge,
}: { icon: React.ReactNode; title: string; description: string; to: string; badge: string }) {
  return (
    <Link to={to as never} className="group">
      <Card className="h-full transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {icon}
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
              {badge}
            </span>
          </div>
          <CardTitle className="mt-3">{title}</CardTitle>
          <CardDescription className="line-clamp-2">{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium text-primary group-hover:underline">Open →</p>
        </CardContent>
      </Card>
    </Link>
  );
}
