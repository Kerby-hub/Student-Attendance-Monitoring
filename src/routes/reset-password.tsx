import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resetPasswordSchema, getPasswordStrength } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);

  // Supabase puts the recovery session token in the URL hash and triggers PASSWORD_RECOVERY
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Also check if a recovery session already exists
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    const parsed = resetPasswordSchema.safeParse({ password, confirmPassword });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      parsed.error.issues.forEach((i) => (map[i.path[0] as string] = i.message));
      setErrors(map);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setSubmitting(false);
    if (error) {
      toast.error("Couldn't update password", { description: error.message });
      return;
    }
    setDone(true);
    toast.success("Password updated");
    setTimeout(() => navigate({ to: "/dashboard", replace: true }), 1500);
  };

  const strength = getPasswordStrength(password);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6" style={{ background: "var(--gradient-subtle)" }}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-[var(--shadow-card)]">
        {done ? (
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold">Password updated</h1>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting to your dashboard...</p>
          </div>
        ) : (
          <>
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Make it strong — at least 8 characters with mixed case and numbers.
            </p>

            {!ready && (
              <p className="mt-4 rounded-md bg-muted p-3 text-xs text-muted-foreground">
                Waiting for recovery link... If nothing happens, request a new email from the
                <a href="/forgot-password" className="ml-1 font-medium text-primary hover:underline">forgot password</a> page.
              </p>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={submitting || !ready}
                />
                {password && (
                  <div className="space-y-1">
                    <div className="flex h-1.5 gap-1">
                      {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div key={i} className={`flex-1 rounded-full ${i <= strength.score ? strength.color : "bg-muted"}`} />
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Strength: <span className="font-medium">{strength.label}</span></p>
                  </div>
                )}
                {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={submitting || !ready}
                />
                {errors.confirmPassword && <p className="text-xs text-destructive">{errors.confirmPassword}</p>}
              </div>

              <Button type="submit" className="w-full" disabled={submitting || !ready}>
                {submitting ? <LoadingSpinner size="sm" className="text-primary-foreground" /> : "Update password"}
              </Button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
