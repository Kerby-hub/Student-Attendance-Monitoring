import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldX, LogOut, LayoutDashboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/access-denied")({
  component: AccessDeniedPage,
});

function AccessDeniedPage() {
  const { roles, user, signOut } = useAuth();
  const navigate = useNavigate();

  const target = roles.includes("admin")
    ? "/admin"
    : roles.includes("teacher")
      ? "/teacher"
      : roles.includes("student")
        ? "/student"
        : null;

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <ShieldX className="h-10 w-10" />
        </div>
        <h1 className="text-3xl font-bold">Access Denied</h1>
        <p className="mt-2 text-muted-foreground">
          You do not have permission to access this page.
        </p>
        {user && roles.length === 0 && (
          <p className="mt-2 text-sm text-muted-foreground">
            Your account has no assigned role. Please contact your administrator.
          </p>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {target && (
            <Button onClick={() => navigate({ to: target as never })}>
              <LayoutDashboard className="mr-2 h-4 w-4" /> Go to my dashboard
            </Button>
          )}
          {user ? (
            <Button variant="outline" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sign out
            </Button>
          ) : (
            <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
              Go to login
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
