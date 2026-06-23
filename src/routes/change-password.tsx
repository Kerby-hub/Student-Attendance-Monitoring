import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { RequiredMark, FieldError, invalidInputClass } from "@/components/ui/form-field";
import { passwordSchema } from "@/lib/validation";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/change-password")({
  component: () => (
    <ProtectedRoute>
      <Page />
    </ProtectedRoute>
  ),
});

function Page() {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ pwd?: string; confirm?: string }>({});

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: { pwd?: string; confirm?: string } = {};
    const pwdCheck = passwordSchema.safeParse(pwd);
    if (!pwdCheck.success) errs.pwd = pwdCheck.error.issues[0]?.message ?? "Invalid password.";
    if (!confirm) errs.confirm = "Please confirm your password.";
    else if (pwd !== confirm) errs.confirm = "Passwords do not match.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) {
      setSubmitting(false);
      return toast.error("Failed to update password", { description: error.message });
    }
    await supabase.from("profiles").update({ must_change_password: false }).eq("id", user!.id);
    await refreshProfile();
    setSubmitting(false);
    toast.success("Password updated");
    navigate({ to: "/dashboard", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4" style={{ background: "var(--gradient-subtle)" }}>
      <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
        <CardHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <CardTitle className="text-center">
            {profile?.must_change_password ? "Set your password" : "Change password"}
          </CardTitle>
          <CardDescription className="text-center">
            {profile?.must_change_password
              ? "You're using a temporary password. Please choose a new one to continue."
              : "Update your account password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="new">New password<RequiredMark /></Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="new" type="password" className={cn("pl-9", errors.pwd && invalidInputClass)} value={pwd} onChange={(e) => { setPwd(e.target.value); if (errors.pwd) setErrors((x) => ({ ...x, pwd: undefined })); }} autoComplete="new-password" />
              </div>
              <FieldError message={errors.pwd} />
              <p className="text-[11px] text-muted-foreground">At least 8 characters, with uppercase, lowercase, and a number.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Confirm new password<RequiredMark /></Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input id="confirm" type="password" className={cn("pl-9", errors.confirm && invalidInputClass)} value={confirm} onChange={(e) => { setConfirm(e.target.value); if (errors.confirm) setErrors((x) => ({ ...x, confirm: undefined })); }} autoComplete="new-password" />
              </div>
              <FieldError message={errors.confirm} />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Updating…" : "Update password"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

