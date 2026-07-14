import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Search, RotateCcw, Ban, CheckCircle2, Eye } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminResetDevice, adminSetDeviceStatus } from "@/lib/device/device.functions";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/admin/devices")({
  component: DevicesPage,
});

type DeviceRow = {
  id: string;
  user_id: string;
  device_fingerprint: string;
  device_name: string | null;
  user_agent: string | null;
  platform: string | null;
  status: string;
  registration_date: string;
  last_login: string | null;
  profile: { email: string; full_name: string | null } | null;
  student_no: string | null;
  teacher_no: string | null;
  role: "admin" | "teacher" | "student" | null;
};

function DevicesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [viewing, setViewing] = useState<DeviceRow | null>(null);
  const [resetTarget, setResetTarget] = useState<DeviceRow | null>(null);

  const resetFn = useServerFn(adminResetDevice);
  const setStatusFn = useServerFn(adminSetDeviceStatus);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_registrations")
        .select("*")
        .order("last_login", { ascending: false, nullsFirst: false });
      if (error) throw error;
      const ids = (data ?? []).map((d: any) => d.user_id);
      if (ids.length === 0) return [];
      const [{ data: profiles }, { data: students }, { data: teachers }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("id, email, full_name").in("id", ids),
        supabase.from("students").select("user_id, student_no").in("user_id", ids),
        supabase.from("teachers").select("user_id, teacher_no").in("user_id", ids),
        supabase.from("user_roles").select("user_id, role").in("user_id", ids),
      ]);
      const pMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
      const sMap = new Map((students ?? []).map((s: any) => [s.user_id, s.student_no]));
      const tMap = new Map((teachers ?? []).map((t: any) => [t.user_id, t.teacher_no]));
      const rMap = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
      return (data ?? []).map((d: any) => ({
        ...d,
        profile: pMap.get(d.user_id) ?? null,
        student_no: sMap.get(d.user_id) ?? null,
        teacher_no: tMap.get(d.user_id) ?? null,
        role: rMap.get(d.user_id) ?? null,
      })) as DeviceRow[];
    },
  });

  const filtered = rows.filter((r) => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      const hay = `${r.profile?.full_name ?? ""} ${r.profile?.email ?? ""} ${r.student_no ?? ""} ${r.teacher_no ?? ""} ${r.device_name ?? ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const resetDevice = useMutation({
    mutationFn: async (r: DeviceRow) => { await resetFn({ data: { userId: r.user_id } }); },
    onSuccess: () => {
      toast.success("Device binding reset", { description: "User can register a new device on next login." });
      qc.invalidateQueries({ queryKey: ["admin-devices"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async (r: DeviceRow) => {
      const next = r.status === "active" ? "disabled" : "active";
      await setStatusFn({ data: { userId: r.user_id, status: next as "active" | "disabled" } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-devices"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <PageHeader
        title="Device Management"
        description="One account, one device. Reset bindings or disable devices when needed."
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, email, student ID, device…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="disabled">Disabled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Student / Teacher ID</TableHead>
              <TableHead>Device</TableHead>
              <TableHead>Registered</TableHead>
              <TableHead>Last login</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">No registered devices yet.</TableCell></TableRow>
            ) : filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell>
                  <div className="font-medium">{r.profile?.full_name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{r.profile?.email}</div>
                </TableCell>
                <TableCell>
                  {r.role ? <Badge variant="outline" className="capitalize">{r.role}</Badge> : <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {r.role === "teacher" ? (r.teacher_no || "—") : r.role === "student" ? (r.student_no || "—") : "N/A"}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{r.device_name || "Unknown"}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{r.device_fingerprint.slice(0, 16)}…</div>
                </TableCell>
                <TableCell className="text-sm">{new Date(r.registration_date).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{r.last_login ? new Date(r.last_login).toLocaleString() : "—"}</TableCell>
                <TableCell>
                  {r.status === "active"
                    ? <Badge className="bg-success text-success-foreground">Active</Badge>
                    : <Badge variant="destructive">Disabled</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="View details" onClick={() => setViewing(r)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title={r.status === "active" ? "Disable device" : "Enable device"} onClick={() => toggleStatus.mutate(r)}>
                    {r.status === "active" ? <Ban className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-success" />}
                  </Button>
                  <Button variant="ghost" size="icon" title="Reset device binding" onClick={() => setResetTarget(r)}>
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Device details</DialogTitle>
            <DialogDescription>{viewing?.profile?.email}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <dl className="grid grid-cols-3 gap-3 text-sm">
              <dt className="text-muted-foreground">Device</dt><dd className="col-span-2 font-medium">{viewing.device_name}</dd>
              <dt className="text-muted-foreground">Platform</dt><dd className="col-span-2">{viewing.platform}</dd>
              <dt className="text-muted-foreground">User agent</dt><dd className="col-span-2 break-all text-xs">{viewing.user_agent}</dd>
              <dt className="text-muted-foreground">Fingerprint</dt><dd className="col-span-2 break-all font-mono text-xs">{viewing.device_fingerprint}</dd>
              <dt className="text-muted-foreground">Registered</dt><dd className="col-span-2">{new Date(viewing.registration_date).toLocaleString()}</dd>
              <dt className="text-muted-foreground">Last login</dt><dd className="col-span-2">{viewing.last_login ? new Date(viewing.last_login).toLocaleString() : "—"}</dd>
              <dt className="text-muted-foreground">Status</dt><dd className="col-span-2 capitalize">{viewing.status}</dd>
            </dl>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!resetTarget}
        onOpenChange={(v) => { if (!v) setResetTarget(null); }}
        title="Reset device binding?"
        description={<>Reset the device for <span className="font-medium">{resetTarget?.profile?.email}</span>? They will be able to register a new device on their next login.</>}
        confirmLabel="Reset device"
        destructive={false}
        loading={resetDevice.isPending}
        loadingLabel="Resetting…"
        onConfirm={() => { if (resetTarget) { const r = resetTarget; resetDevice.mutate(r, { onSettled: () => setResetTarget(null) }); } }}
      />
    </div>
  );
}
