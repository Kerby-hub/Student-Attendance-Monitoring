import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppRole } from "@/contexts/AuthContext";
import { FullPageLoader } from "./LoadingSpinner";

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, only users with at least one of these roles can view. */
  allowedRoles?: AppRole[];
}

/**
 * Guards a route: redirects unauthenticated users to /login,
 * and shows Access Denied for users without the required role(s).
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { user, loading, hasAnyRole } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", replace: true });
    }
  }, [loading, user, navigate]);

  if (loading) return <FullPageLoader />;
  if (!user) return null;

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    // Render Access Denied inline (keeps URL — easier for the user)
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
