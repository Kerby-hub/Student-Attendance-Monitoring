import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Pencil, Trash2, Crosshair, Map as MapIcon } from "lucide-react";
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
import { RequiredMark, FieldError, invalidInputClass } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";


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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });


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
        await logAudit("geofence.update", editing.id, { ...form });
      } else {
        const { data, error } = await supabase.from("geofence_zones").insert(form).select("id").single();
        if (error) throw error;
        await logAudit("geofence.create", data?.id ?? null, { ...form });
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
                <div>
                  <Label>Name<RequiredMark /></Label>
                  <Input value={form.name} className={cn(errors.name && invalidInputClass)} onChange={(e) => { setForm({ ...form, name: e.target.value }); clearErr("name"); }} placeholder="Main Campus Room 101" />
                  <FieldError message={errors.name} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Latitude<RequiredMark /></Label>
                    <Input type="number" step="any" className={cn(errors.center_lat && invalidInputClass)} value={form.center_lat} onChange={(e) => { setForm({ ...form, center_lat: Number(e.target.value) }); clearErr("center_lat"); }} />
                    <FieldError message={errors.center_lat} />
                  </div>
                  <div>
                    <Label>Longitude<RequiredMark /></Label>
                    <Input type="number" step="any" className={cn(errors.center_lng && invalidInputClass)} value={form.center_lng} onChange={(e) => { setForm({ ...form, center_lng: Number(e.target.value) }); clearErr("center_lng"); }} />
                    <FieldError message={errors.center_lng} />
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={useMyLocation}>
                    <Crosshair className="mr-1.5 h-4 w-4" /> Use my current location
                  </Button>
                  <Button
                    type="button" variant="outline" size="sm"
                    onClick={() => {
                      const lat = form.center_lat || 0;
                      const lng = form.center_lng || 0;
                      const z = lat || lng ? 17 : 3;
                      window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=${z}/${lat}/${lng}`, "_blank", "noopener");
                      toast.info("Pick a point on the map", { description: "Right-click → 'Show address' to copy coordinates, then paste them here." });
                    }}
                  >
                    <MapIcon className="mr-1.5 h-4 w-4" /> Choose on map
                  </Button>
                  {form.center_lat && form.center_lng ? (
                    <a
                      className="inline-flex items-center text-xs text-primary underline-offset-2 hover:underline"
                      href={`https://www.google.com/maps?q=${form.center_lat},${form.center_lng}`}
                      target="_blank" rel="noopener noreferrer"
                    >
                      Preview current point
                    </a>
                  ) : null}
                </div>
                <div>
                  <Label>Radius (meters)<RequiredMark /></Label>
                  <Input type="number" min={5} max={10000} className={cn(errors.radius_meters && invalidInputClass)} value={form.radius_meters} onChange={(e) => { setForm({ ...form, radius_meters: Number(e.target.value) }); clearErr("radius_meters"); }} />
                  <FieldError message={errors.radius_meters} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    const errs: Record<string, string> = {};
                    if (!form.name.trim()) errs.name = "Name is required.";
                    if (!(form.center_lat >= -90 && form.center_lat <= 90)) errs.center_lat = "Latitude must be between -90 and 90.";
                    if (!(form.center_lng >= -180 && form.center_lng <= 180)) errs.center_lng = "Longitude must be between -180 and 180.";
                    if (!(form.radius_meters > 0)) errs.radius_meters = "Radius must be greater than 0.";
                    else if (form.radius_meters < 5 || form.radius_meters > 10000) errs.radius_meters = "Radius must be between 5 and 10,000 meters.";
                    setErrors(errs);
                    if (Object.keys(errs).length === 0) upsert.mutate();
                  }}
                  disabled={upsert.isPending}
                >{editing ? "Save" : "Create"}</Button>
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
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(z)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {error ? (
        <p className="mt-3 text-sm text-destructive">Failed to load zones: {(error as Error).message}</p>
      ) : null}
      <p className="mt-3 text-xs text-muted-foreground">
        Assign zones to schedules from the Schedules page. Validation uses the Haversine distance.
      </p>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => { if (!v) setToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this zone?</AlertDialogTitle>
            <AlertDialogDescription>
              "{toDelete?.name}" will be permanently removed. Schedules assigned to this zone
              will no longer enforce its boundary. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); if (toDelete) del.mutate(toDelete); }}
              disabled={del.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {del.isPending ? "Deleting…" : "Delete zone"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
