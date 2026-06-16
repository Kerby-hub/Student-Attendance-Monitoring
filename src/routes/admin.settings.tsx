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

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

type SmsProvider = "stub" | "semaphore";

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
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const updates: Array<{ key: string; value: any }> = [
      { key: "qr_rotation_seconds", value: qr },
      { key: "late_grace_minutes", value: grace },
      { key: "default_geofence_radius_m", value: radius },
      { key: "sms_provider", value: smsProvider },
    ];
    for (const u of updates) {
      await (supabase as any).from("system_settings").upsert({ key: u.key, value: u.value, updated_at: new Date().toISOString() });
    }
    toast.success("Settings saved");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="System Settings" description="Configure attendance, geofencing, and SMS defaults." />
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <>
          <Card className="max-w-xl shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle>Attendance</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>QR rotation interval (seconds)</Label><Input type="number" value={qr} onChange={(e) => setQr(Number(e.target.value))} /></div>
              <div><Label>Late grace period (minutes)</Label><Input type="number" value={grace} onChange={(e) => setGrace(Number(e.target.value))} /></div>
              <div><Label>Default geofence radius (meters)</Label><Input type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></div>
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

          <Button onClick={save}>Save settings</Button>
        </>
      )}
    </div>
  );
}
