import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";

export const Route = createFileRoute("/admin/location")({
  component: LocationPage,
});

type Zone = { id: string; name: string; center_lat: number; center_lng: number; radius_meters: number; active: boolean };
type CheckIn = {
  id: string; status: string; check_in_at: string;
  check_in_lat: number | null; check_in_lng: number | null;
  students: { full_name: string; student_no: string } | null;
};

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function LocationPage() {
  const { hasRole } = useAuth();
  const isAdmin = hasRole("admin");
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [zoneId, setZoneId] = useState("all");

  const { data: zones = [] } = useQuery({
    queryKey: ["loc-zones"],
    queryFn: async () => {
      const { data, error } = await supabase.from("geofence_zones").select("*").order("name");
      if (error) throw error;
      return data as Zone[];
    },
  });

  const { data: checkIns = [], isLoading, error } = useQuery({
    queryKey: ["loc-checkins", date],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(`
          id, status, check_in_at, check_in_lat, check_in_lng,
          students:students!attendance_records_student_id_fkey(full_name, student_no)
        `)
        .gte("check_in_at", `${date}T00:00:00`)
        .lte("check_in_at", `${date}T23:59:59`)
        .not("check_in_lat", "is", null)
        .order("check_in_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as unknown as CheckIn[];
    },
  });

  const selectedZone = zones.find((z) => z.id === zoneId);
  const filtered = selectedZone
    ? checkIns.filter((c) =>
        c.check_in_lat != null && c.check_in_lng != null &&
        haversineM(c.check_in_lat, c.check_in_lng, selectedZone.center_lat, selectedZone.center_lng) <= selectedZone.radius_meters)
    : checkIns;

  if (!isAdmin) return <Card><CardContent className="p-6">Admin access required.</CardContent></Card>;

  return (
    <div>
      <PageHeader title="Location Monitoring" description="Geo-tagged check-ins recorded by students during attendance. Filter by date and zone." />

      <Card className="mb-4 shadow-[var(--shadow-card)]"><CardContent className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><Label>Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} max={today} /></div>
          <div className="sm:col-span-2">
            <Label>Zone</Label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All check-ins</SelectItem>
                {zones.map((z) => <SelectItem key={z.id} value={z.id}>{z.name} ({z.radius_meters}m)</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Badge>{filtered.length} points</Badge>
          </div>
        </div>
      </CardContent></Card>

      {error ? <Card className="mb-3"><CardContent className="p-3 text-sm text-destructive">{(error as Error).message}</CardContent></Card> : null}

      <Card className="shadow-[var(--shadow-card)]"><CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Time</TableHead><TableHead>Student</TableHead>
            <TableHead>Coordinates</TableHead><TableHead>Distance to zone</TableHead>
            <TableHead>Status</TableHead><TableHead className="text-right">Map</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                <MapPin className="mx-auto mb-2 h-8 w-8 opacity-40" />No geo-tagged check-ins for this filter.
              </TableCell></TableRow>
            ) : filtered.map((c) => {
              const lat = c.check_in_lat ?? 0, lng = c.check_in_lng ?? 0;
              const dist = selectedZone ? haversineM(lat, lng, selectedZone.center_lat, selectedZone.center_lng) : null;
              return (
                <TableRow key={c.id}>
                  <TableCell className="text-sm whitespace-nowrap">{new Date(c.check_in_at).toLocaleTimeString()}</TableCell>
                  <TableCell>{c.students?.full_name} <span className="text-xs text-muted-foreground">({c.students?.student_no})</span></TableCell>
                  <TableCell className="font-mono text-xs">{lat.toFixed(5)}, {lng.toFixed(5)}</TableCell>
                  <TableCell className="text-sm">{dist != null ? `${Math.round(dist)} m` : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{c.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <a className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                       href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer">
                      Open <ExternalLink className="h-3 w-3" />
                    </a>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <p className="mt-3 text-xs text-muted-foreground">
        Live continuous tracking is not enabled — only the GPS coordinates captured at the moment of each scan are stored.
        Use Geofencing → Zones to manage allowed areas.
      </p>
    </div>
  );
}
