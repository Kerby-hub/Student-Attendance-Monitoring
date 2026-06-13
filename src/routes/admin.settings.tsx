import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/admin/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [qr, setQr] = useState(15);
  const [grace, setGrace] = useState(10);
  const [radius, setRadius] = useState(100);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any).from("system_settings").select("*");
      const map = new Map<string, number>();
      (data ?? []).forEach((r: any) => map.set(r.key, Number(r.value)));
      setQr(map.get("qr_rotation_seconds") ?? 15);
      setGrace(map.get("late_grace_minutes") ?? 10);
      setRadius(map.get("default_geofence_radius_m") ?? 100);
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    const updates = [
      { key: "qr_rotation_seconds", value: qr },
      { key: "late_grace_minutes", value: grace },
      { key: "default_geofence_radius_m", value: radius },
    ];
    for (const u of updates) {
      await (supabase as any).from("system_settings").upsert({ key: u.key, value: u.value, updated_at: new Date().toISOString() });
    }
    toast.success("Settings saved");
  };

  return (
    <div>
      <PageHeader title="System Settings" description="Configure attendance and geofencing defaults." />
      {loading ? <p className="text-muted-foreground">Loading…</p> : (
        <Card className="max-w-xl shadow-[var(--shadow-card)]">
          <CardHeader><CardTitle>Attendance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>QR rotation interval (seconds)</Label><Input type="number" value={qr} onChange={(e) => setQr(Number(e.target.value))} /></div>
            <div><Label>Late grace period (minutes)</Label><Input type="number" value={grace} onChange={(e) => setGrace(Number(e.target.value))} /></div>
            <div><Label>Default geofence radius (meters)</Label><Input type="number" value={radius} onChange={(e) => setRadius(Number(e.target.value))} /></div>
            <Button onClick={save}>Save settings</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
