import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, User, ClipboardList } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavHeader } from "@/components/NavHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student")({
  component: () => (
    <ProtectedRoute allowedRoles={["student", "admin", "teacher"]}>
      <StudentLayout />
    </ProtectedRoute>
  ),
});

const tabs = [
  { to: "/student", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/student/profile", label: "Profile", icon: User },
  { to: "/student/attendance", label: "Attendance", icon: ClipboardList },
];

function StudentLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <div className="border-b bg-card">
        <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6">
          {tabs.map((t) => {
            const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition",
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </Link>
            );
          })}
        </nav>
      </div>
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
