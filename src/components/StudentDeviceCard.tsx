import { useQuery } from "@tanstack/react-query";
import { Smartphone, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function StudentDeviceCard() {
  const { user } = useAuth();
  const { data, isLoading } = useQuery({
    queryKey: ["my-device", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("device_registrations")
        .select("device_name, platform, registration_date, last_login, status")
        .eq("user_id", user!.id)
        .maybeSingle();
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Smartphone className="h-4 w-4 text-primary" />
          Registered Device
        </CardTitle>
        {data?.status === "active" && <Badge className="bg-success text-success-foreground gap-1"><CheckCircle2 className="h-3 w-3" />Authorized</Badge>}
        {data?.status === "disabled" && <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" />Disabled</Badge>}
        {!isLoading && !data && <Badge variant="secondary">Not registered</Badge>}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data ? (
          <p className="text-sm text-muted-foreground">No device on file. Sign in on your phone to register it.</p>
        ) : (
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <dt className="text-muted-foreground">Device</dt><dd className="col-span-2 font-medium">{data.device_name || "Unknown"}</dd>
            <dt className="text-muted-foreground">Platform</dt><dd className="col-span-2">{data.platform || "—"}</dd>
            <dt className="text-muted-foreground">Registered</dt><dd className="col-span-2">{new Date(data.registration_date).toLocaleString()}</dd>
            <dt className="text-muted-foreground">Last login</dt><dd className="col-span-2">{data.last_login ? new Date(data.last_login).toLocaleString() : "—"}</dd>
          </dl>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          One account = one device. To switch devices, contact your administrator.
        </p>
      </CardContent>
    </Card>
  );
}
