import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/contexts/AuthContext";
import { FullPageLoader } from "./LoadingSpinner";

/**
 * Wraps public auth pages (Login, Forgot password). If the visitor is already
 * authenticated, they are redirected to the role-appropriate dashboard using
 * REPLACE navigation so the login page is removed from browser history.
 * The page is not rendered until we confirm the visitor is a guest.
 */
export function GuestOnlyRoute({ children }: { children: ReactNode }) {
  const { user, profile, roles, authLoading, roleLoading } = useAuth();
  const navigate = useNavigate();

  const target = profile?.must_change_password
    ? "/change-password"
    : roles.includes("admin")
      ? "/admin"
      : roles.includes("teacher")
        ? "/teacher"
        : roles.includes("student")
          ? "/student"
          : "/dashboard";

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (user) {
      navigate({ to: target as never, replace: true });
    }
  }, [authLoading, roleLoading, user, target, navigate]);

  if (authLoading || roleLoading) return <FullPageLoader />;
  if (user) return <FullPageLoader />;
  return <>{children}</>;
}
