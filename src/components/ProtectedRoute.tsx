import { useEffect, type ReactNode } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/contexts/AuthContext";
import { FullPageLoader } from "./LoadingSpinner";
import { useDeviceGuard } from "@/hooks/useDeviceGuard";


interface ProtectedRouteProps {
  children: ReactNode;
  allowedRoles?: AppRole[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, profile, loading, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  useDeviceGuard(!!user && !!profile && !profile.must_change_password);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: "/login", replace: true });
      return;
    }
    // Force temp-password change on first login
    if (profile?.must_change_password && pathname !== "/change-password") {
      navigate({ to: "/change-password", replace: true });
    }
  }, [loading, user, profile, pathname, navigate]);

  if (loading) return <FullPageLoader />;
  if (!user) return null;
  if (profile?.must_change_password && pathname !== "/change-password") return <FullPageLoader />;

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    return <AccessDeniedInline />;
  }

  return <>{children}</>;
}

function AccessDeniedInline() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive text-3xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-bold">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          You don't have permission to view this page.
        </p>
        <button
          onClick={() => navigate({ to: "/dashboard" })}
          className="mt-6 inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
