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
  const { user, profile, roles, authLoading, roleLoading, hasAnyRole } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const search = useRouterState({ select: (r) => r.location.search });
  useDeviceGuard(!!user && !!profile && !profile.must_change_password);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const redirect = pathname + (typeof window !== "undefined" ? window.location.search : "");
      navigate({
        to: "/login",
        replace: true,
        search: { redirect } as never,
      });
      return;
    }
    // Wait for role/profile fetch to complete before any role-based decision
    if (roleLoading) return;
    if (profile?.must_change_password && pathname !== "/change-password") {
      navigate({ to: "/change-password", replace: true });
      return;
    }
    if (!profile?.must_change_password && roles.length === 0) {
      if (pathname !== "/access-denied") {
        navigate({ to: "/access-denied", replace: true });
      }
    }
  }, [authLoading, roleLoading, user, profile, roles, pathname, search, navigate]);

  if (authLoading) return <FullPageLoader />;
  if (!user) return <FullPageLoader />;
  if (roleLoading) return <FullPageLoader />;
  if (profile?.must_change_password && pathname !== "/change-password") return <FullPageLoader />;
  if (!profile?.must_change_password && roles.length === 0) return <FullPageLoader />;

  if (allowedRoles && allowedRoles.length > 0 && !hasAnyRole(allowedRoles)) {
    return <AccessDeniedInline />;
  }

  return <>{children}</>;
}

function AccessDeniedInline() {
  const { roles, signOut } = useAuth();
  const navigate = useNavigate();
  const target = roles.includes("admin")
    ? "/admin"
    : roles.includes("teacher")
      ? "/teacher"
      : roles.includes("student")
        ? "/student"
        : "/login";
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
        <div className="mt-6 flex justify-center gap-2">
          <button
            onClick={() => navigate({ to: target as never })}
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to my dashboard
          </button>
          <button
            onClick={async () => { await signOut(); navigate({ to: "/login", replace: true }); }}
            className="inline-flex h-10 items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
