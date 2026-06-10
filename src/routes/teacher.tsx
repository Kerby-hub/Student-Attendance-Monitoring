import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavHeader } from "@/components/NavHeader";

export const Route = createFileRoute("/teacher")({
  component: () => (
    <ProtectedRoute allowedRoles={["admin", "teacher"]}>
      <Page />
    </ProtectedRoute>
  ),
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold">Teacher Portal</h1>
        <p className="mt-2 text-muted-foreground">Visible to teachers and administrators.</p>
      </main>
    </div>
  );
}
