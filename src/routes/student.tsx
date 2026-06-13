import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, User, ScanLine, Calendar, Bell, ClipboardList } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavHeader } from "@/components/NavHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
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
  { to: "/student/attendance", label: "Scan", icon: ScanLine },
  { to: "/student/calendar", label: "Calendar", icon: Calendar },
  { to: "/student/history", label: "History", icon: ClipboardList },
  { to: "/student/notifications", label: "Inbox", icon: Bell, badge: true },
  { to: "/student/profile", label: "Profile", icon: User },
];

function StudentLayout() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { user } = useAuth();

  const { data: unread = 0 } = useQuery({
    queryKey: ["my-unread-count", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("notifications")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user!.id).eq("read", false);
      return count ?? 0;
    },
    refetchInterval: 30000,
  });

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
                  "relative flex shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm transition",
                  active
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
                {t.badge && unread > 0 && (
                  <span className="ml-1 grid h-5 min-w-5 place-items-center rounded-full bg-destructive px-1.5 text-[10px] font-bold text-destructive-foreground">
                    {unread > 99 ? "99+" : unread}
                  </span>
                )}
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
