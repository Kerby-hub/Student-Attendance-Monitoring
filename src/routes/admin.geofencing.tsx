import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Pencil, Trash2, Crosshair } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/geofencing")({
  component: GeofencingPage,
});

type Zone = {
  id: string; name: string;
  center_lat: number; center_lng: number;
  radius_meters: number; active: boolean;
};

function GeofencingPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [toDelete, setToDelete] = useState<Zone | null>(null);
  const [form, setForm] = useState({ name: "", center_lat: 0, center_lng: 0, radius_meters: 100, active: true });

  const { data = [], isLoading, error } = useQuery({
    queryKey: ["geofences"],
    queryFn: async () => {
      const { data, error } = await supabase.from("geofence_zones").select("*").order("name");
      if (error) throw error;
      return data as Zone[];
    },
  });

  const logAudit = async (action: string, entity_id: string | null, metadata: Record<string, unknown>) => {
    try {
      await supabase.from("audit_logs").insert({
        actor_id: user?.id ?? null,
        action,
        entity_type: "geofence_zone",
        entity_id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        metadata: metadata as any,
      });
    } catch {
      /* non-blocking */
    }
  };

  const validate = (): string | null => {
    if (!form.name.trim()) return "Name is required.";
    if (form.center_lat < -90 || form.center_lat > 90) return "Latitude must be between -90 and 90.";
    if (form.center_lng < -180 || form.center_lng > 180) return "Longitude must be between -180 and 180.";
    if (form.radius_meters < 5 || form.radius_meters > 10000) return "Radius must be between 5 and 10,000 meters.";
    return null;
  };

  const upsert = useMutation({
    mutationFn: async () => {
      const err = validate();
      if (err) throw new Error(err);
      if (editing) {
        const { error } = await supabase.from("geofence_zones").update(form).eq("id", editing.id);
        if (error) throw error;
        await logAudit("geofence.update", editing.id, { name: form.name, ...form });
      } else {
        const { data, error } = await supabase.from("geofence_zones").insert(form).select("id").single();
        if (error) throw error;
        await logAudit("geofence.create", data?.id ?? null, { name: form.name, ...form });
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Zone updated" : "Zone created");
      qc.invalidateQueries({ queryKey: ["geofences"] });
      setOpen(false); setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (z: Zone) => {
      const { error } = await supabase.from("geofence_zones").delete().eq("id", z.id);
      if (error) throw error;
      await logAudit("geofence.delete", z.id, { name: z.name });
    },
    onSuccess: () => { toast.success("Zone deleted"); qc.invalidateQueries({ queryKey: ["geofences"] }); setToDelete(null); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", center_lat: 0, center_lng: 0, radius_meters: 100, active: true });
    setOpen(true);
  };
  const openEdit = (z: Zone) => {
    setEditing(z);
    setForm({ name: z.name, center_lat: z.center_lat, center_lng: z.center_lng, radius_meters: z.radius_meters, active: z.active });
    setOpen(true);
  };

  const useMyLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    navigator.geolocation.getCurrentPosition(
      (pos) => setForm((f) => ({ ...f, center_lat: pos.coords.latitude, center_lng: pos.coords.longitude })),
      (err) => toast.error("Couldn't get location", { description: err.message }),
    );
  };

  return (
    <div>
      <PageHeader
        title="Geofencing"
        description="Define allowed attendance zones. Students outside the radius cannot check in."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New zone</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit zone" : "New zone"}</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Main Campus Room 101" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Latitude</Label><Input type="number" step="any" value={form.center_lat} onChange={(e) => setForm({ ...form, center_lat: Number(e.target.value) })} /></div>
                  <div><Label>Longitude</Label><Input type="number" step="any" value={form.center_lng} onChange={(e) => setForm({ ...form, center_lng: Number(e.target.value) })} /></div>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
                  <Crosshair className="mr-1.5 h-4 w-4" /> Use my current location
                </Button>
                <div><Label>Radius (meters)</Label><Input type="number" value={form.radius_meters} onChange={(e) => setForm({ ...form, radius_meters: Number(e.target.value) })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => upsert.mutate()} disabled={!form.name || upsert.isPending}>{editing ? "Save" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="rounded-lg border bg-card overflow-x-auto shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Coordinates</TableHead>
              <TableHead>Radius</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                <MapPin className="mx-auto mb-2 h-8 w-8 opacity-40" />
                No geofence zones yet.
              </TableCell></TableRow>
            ) : data.map((z) => (
              <TableRow key={z.id}>
                <TableCell className="font-medium">{z.name}</TableCell>
                <TableCell className="font-mono text-xs">{z.center_lat.toFixed(5)}, {z.center_lng.toFixed(5)}</TableCell>
                <TableCell>{z.radius_meters} m</TableCell>
                <TableCell>{z.active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(z)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm(`Delete "${z.name}"?`)) del.mutate(z.id); }}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Assign zones to schedules from the Schedules page (TODO: per-schedule zone picker). Validation uses the Haversine distance.
      </p>
    </div>
  );
}
