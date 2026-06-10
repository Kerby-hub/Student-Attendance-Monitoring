import { createFileRoute } from "@tanstack/react-router";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { NavHeader } from "@/components/NavHeader";

export const Route = createFileRoute("/admin")({
  component: () => (
    <ProtectedRoute allowedRoles={["admin"]}>
      <Page />
    </ProtectedRoute>
  ),
});

function Page() {
  return (
    <div className="min-h-screen bg-background">
      <NavHeader />
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-extrabold">Admin Area</h1>
        <p className="mt-2 text-muted-foreground">Only administrators can see this page.</p>
      </main>
    </div>
  );
}
