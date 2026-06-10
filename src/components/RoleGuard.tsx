import type { ReactNode } from "react";
import { useAuth, type AppRole } from "@/contexts/AuthContext";

/**
 * Conditionally renders children only if the user has any of the allowed roles.
 * Useful for hiding/showing buttons or nav items based on role.
 */
export function RoleGuard({
  allowedRoles,
  fallback = null,
  children,
}: {
  allowedRoles: AppRole[];
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const { hasAnyRole } = useAuth();
  if (!hasAnyRole(allowedRoles)) return <>{fallback}</>;
  return <>{children}</>;
}
