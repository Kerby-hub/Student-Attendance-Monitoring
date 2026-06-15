import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { TeacherSidebar } from "@/components/TeacherSidebar";
import { Topbar } from "@/components/Topbar";
import { SidebarProvider } from "@/components/ui/sidebar";

export const Route = createFileRoute("/teacher")({
  component: () => (
    <ProtectedRoute allowedRoles={["admin", "teacher"]}>
      <TeacherShell />
    </ProtectedRoute>
  ),
});

function TeacherShell() {
  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <TeacherSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar portal="Teacher Portal" />
          <main className="flex-1 p-4 sm:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
