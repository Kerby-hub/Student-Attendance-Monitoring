import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "@/components/LoadingSpinner";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <ProtectedRoute>
      <DashboardRedirect />
    </ProtectedRoute>
  ),
});

function DashboardRedirect() {
  const { roles, authLoading, roleLoading, profile, user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) return; // ProtectedRoute handles redirect to /login
    if (profile?.must_change_password) return;
    if (roles.includes("admin")) {
      navigate({ to: "/admin", replace: true });
    } else if (roles.includes("teacher")) {
      navigate({ to: "/teacher", replace: true });
    } else if (roles.includes("student")) {
      navigate({ to: "/student", replace: true });
    } else {
      navigate({ to: "/access-denied", replace: true });
    }
  }, [roles, authLoading, roleLoading, profile, user, navigate]);

  return <FullPageLoader />;
}
