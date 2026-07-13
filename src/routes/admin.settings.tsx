import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RequiredMark, FieldError, invalidInputClass } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

type SmsProvider = "stub" | "semaphore";
type EmailProvider = "stub" | "resend" | "smtp";


function parseStr(v: unknown, fallback: string): string {
  if (v == null) return fallback;
  if (typeof v === "string") return v.replace(/^"|"$/g, "");
  return String(v);
}

function SettingsPage() {
  const [qr, setQr] = useState(15);
  const [grace, setGrace] = useState(10);
  const [radius, setRadius] = useState(100);
  const [smsProvider, setSmsProvider] = useState<SmsProvider>("stub");
  const [emailProvider, setEmailProvider] = useState<EmailProvider>("stub");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("system_settings").select("*");
      const map = new Map<string, any>();
      (data ?? []).forEach((r: any) => map.set(r.key, r.value));
      setQr(Number(map.get("qr_rotation_seconds") ?? 15));
      setGrace(Number(map.get("late_grace_minutes") ?? 10));
      setRadius(Number(map.get("default_geofence_radius_m") ?? 100));
      const p = parseStr(map.get("sms_provider"), "stub");
      setSmsProvider(p === "semaphore" ? "semaphore" : "stub");
      const ep = parseStr(map.get("email_provider"), "stub");
      setEmailProvider(ep === "resend" ? "resend" : "stub");
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (saving) return;
    const errs: Record<string, string> = {};
    if (!Number.isFinite(qr) || qr < 5 || qr > 300) errs.qr = "QR rotation interval must be between 5 and 300 seconds.";
    if (!Number.isFinite(grace) || grace < 0 || grace > 240) errs.grace = "Late grace period must be between 0 and 240 minutes.";
    if (!Number.isFinite(radius) || radius < 5 || radius > 10000) errs.radius = "Default geofence radius must be between 5 and 10,000 meters.";
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setSaving(true);
    const updates: Array<{ key: string; value: any }> = [
      { key: "qr_rotation_seconds", value: qr },
      { key: "late_grace_minutes", value: grace },
      { key: "default_geofence_radius_m", value: radius },
      { key: "sms_provider", value: smsProvider },
      { key: "email_provider", value: emailProvider },
    ];
    for (const u of updates) {
      const { error } = await (supabase as any)
        .from("system_settings")
        .upsert({ key: u.key, value: u.value, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) {
        setSaving(false);
        toast.error(`Failed to save ${u.key}: ${error.message}`);
        return;
      }
    }
    setSaving(false);
    toast.success("Settings saved. New attendance sessions will use the updated QR rotation interval.");
  };


  return (
    <div className="space-y-6">
      <PageHeader title="System Settings" description="Configure attendance, geofencing, and SMS defaults." />
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <Card className="max-w-xl shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle>Attendance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>QR rotation interval (seconds)<RequiredMark /></Label>
                <Input type="number" min={5} max={300} value={qr}
                  aria-invalid={!!errors.qr} aria-describedby={errors.qr ? "err-qr" : undefined}
                  className={cn(errors.qr && invalidInputClass)}
                  onChange={(e) => { setQr(Number(e.target.value)); clearErr("qr"); }} />
                <p className="mt-1 text-xs text-muted-foreground">Between 5 and 300 seconds. Applied to newly started attendance sessions.</p>
                <div id="err-qr"><FieldError message={errors.qr} /></div>
              </div>
              <div>
                <Label>Late grace period (minutes)<RequiredMark /></Label>
                <Input type="number" min={0} max={240} value={grace}
                  aria-invalid={!!errors.grace} aria-describedby={errors.grace ? "err-grace" : undefined}
                  className={cn(errors.grace && invalidInputClass)}
                  onChange={(e) => { setGrace(Number(e.target.value)); clearErr("grace"); }} />
                <div id="err-grace"><FieldError message={errors.grace} /></div>
              </div>
              <div>
                <Label>Default geofence radius (meters)<RequiredMark /></Label>
                <Input type="number" min={5} max={10000} value={radius}
                  aria-invalid={!!errors.radius} aria-describedby={errors.radius ? "err-radius" : undefined}
                  className={cn(errors.radius && invalidInputClass)}
                  onChange={(e) => { setRadius(Number(e.target.value)); clearErr("radius"); }} />
                <div id="err-radius"><FieldError message={errors.radius} /></div>
              </div>
            </CardContent>
          </Card>

          <Card className="max-w-xl shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle>SMS Notifications</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>SMS provider</Label>
                <Select value={smsProvider} onValueChange={(v) => setSmsProvider(v as SmsProvider)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stub">Stub (no real SMS)</SelectItem>
                    <SelectItem value="semaphore">Semaphore (PH)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {smsProvider === "stub" ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Stub mode</AlertTitle>
                  <AlertDescription>
                    SMS is currently running in stub mode. No real SMS will be sent — messages are only logged to SMS Notifications.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Semaphore mode</AlertTitle>
                  <AlertDescription>
                    Real SMS will be sent via Semaphore. Make sure <code>SEMAPHORE_API_KEY</code> and (optionally) <code>SEMAPHORE_SENDER_NAME</code> are configured as server secrets, and that your Semaphore account has credits.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="max-w-xl shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle>Account Email (credentials)</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Email provider</Label>
                <Select value={emailProvider} onValueChange={(v) => setEmailProvider(v as EmailProvider)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stub">Stub (log only — no real email)</SelectItem>
                    <SelectItem value="resend">Resend</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {emailProvider === "stub" ? (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Stub mode</AlertTitle>
                  <AlertDescription>
                    Credential emails are logged to <strong>Email Logs</strong> but not actually delivered. Admins can read each generated email there.
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>Resend mode</AlertTitle>
                  <AlertDescription>
                    Real emails will be sent via Resend. Configure <code>RESEND_API_KEY</code> and (optionally) <code>RESEND_FROM_EMAIL</code> as server secrets. Failures are recorded in Email Logs.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save settings"}</Button>

        </>
      )}
    </div>
  );
}
