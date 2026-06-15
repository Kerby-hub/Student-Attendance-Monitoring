import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Settings, ClipboardCheck, BookOpen, LogOut, ArrowRight, GraduationCap } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RoleGuard } from "@/components/RoleGuard";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <ProtectedRoute>
      <DashboardPage />
    </ProtectedRoute>
  ),
});

function DashboardPage() {
  const { profile, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const greeting = profile?.full_name?.split(" ")[0] || "there";

  // Auto-route by primary role
  useEffect(() => {
    if (roles.length === 0) return;
    if (roles.includes("admin")) return; // let admins see picker
  }, [roles]);

  const handleSignOut = async () => { await signOut(); navigate({ to: "/login", replace: true }); };

  return (
    <div className="min-h-screen" style={{ background: "var(--gradient-subtle)" }}>
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-primary-glow text-primary-foreground shadow-md">
              <GraduationCap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight">SAMS</p>
              <p className="text-xs text-muted-foreground">Student Attendance Monitoring System</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="mb-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Welcome</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Hello, {greeting}.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as <span className="font-medium text-foreground">{profile?.email}</span> ·
            Role(s): <span className="capitalize font-medium text-foreground">{roles.join(", ") || "none"}</span>
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <RoleGuard allowedRoles={["admin"]}>
            <PortalCard
              icon={<Settings className="h-5 w-5" />}
              title="Admin Console"
              description="Manage users, devices, geofencing, reports, and system settings."
              to="/admin"
              tone="primary"
              badge="Admin"
            />
          </RoleGuard>

          <RoleGuard allowedRoles={["admin", "teacher"]}>
            <PortalCard
              icon={<ClipboardCheck className="h-5 w-5" />}
              title="Teacher Portal"
              description="Run live attendance sessions and review class reports."
              to="/teacher"
              tone="success"
              badge="Teacher"
            />
          </RoleGuard>

          <RoleGuard allowedRoles={["admin", "teacher", "student"]}>
            <PortalCard
              icon={<BookOpen className="h-5 w-5" />}
              title="Student Area"
              description="Scan QR to check in, view your attendance history and calendar."
              to="/student"
              tone="info"
              badge="Student"
            />
          </RoleGuard>
        </div>
      </main>
    </div>
  );
}

function PortalCard({
  icon, title, description, to, tone, badge,
}: {
  icon: React.ReactNode; title: string; description: string; to: string;
  tone: "primary" | "success" | "info"; badge: string;
}) {
  const toneMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    info: "bg-info/10 text-info",
  } as const;
  return (
    <Link to={to as never} className="group block">
      <div className="h-full overflow-hidden rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-card)] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-elegant)]">
        <div className="flex items-start justify-between">
          <div className={`grid h-11 w-11 place-items-center rounded-lg ${toneMap[tone]} ring-4 ring-current/5`}>
            {icon}
          </div>
          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wider text-secondary-foreground">
            {badge}
          </span>
        </div>
        <h3 className="mt-4 font-display text-lg font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <p className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary">
          Open portal <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </p>
      </div>
    </Link>
  );
}
