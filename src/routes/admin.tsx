import { createFileRoute, Outlet, Link } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/admin")({
  component: () => (
    <ProtectedRoute allowedRoles={["admin"]}>
      <AdminShell />
    </ProtectedRoute>
  ),
});

function AdminShell() {
  const { profile, signOut } = useAuth();
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex flex-1 flex-col">
          <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-background/95 px-4 backdrop-blur">
            <div className="flex items-center gap-2 min-w-0">
              <SidebarTrigger />
              <span className="hidden truncate text-sm font-medium text-muted-foreground sm:inline">
                Student Attendance Monitoring System
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Link to="/dashboard" className="text-sm text-muted-foreground hover:underline">
                Exit admin
              </Link>
              <span className="hidden text-sm text-muted-foreground sm:inline">{profile?.email}</span>
              <Button variant="outline" size="sm" onClick={() => signOut()}>
                <LogOut className="mr-1.5 h-4 w-4" /> Sign out
              </Button>
            </div>
          </header>
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
