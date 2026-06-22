import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, KeyRound, UserX, UserCheck, Trash2, Search, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminCreateUser, adminResetPassword, adminSetStatus, adminDeleteUser, adminSetRole,
} from "@/lib/admin/users.functions";
import { adminResetDevice } from "@/lib/device/device.functions";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { invalidateUserCaches } from "@/lib/admin/invalidate";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/admin/users")({
  component: UsersPage,
});

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  must_change_password: boolean;
  role: "admin" | "teacher" | "student" | null;
};

function randomPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function UsersPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  const createUserFn = useServerFn(adminCreateUser);
  const resetPwdFn = useServerFn(adminResetPassword);
  const setStatusFn = useServerFn(adminSetStatus);
  const deleteUserFn = useServerFn(adminDeleteUser);
  const setRoleFn = useServerFn(adminSetRole);
  const resetDeviceFn = useServerFn(adminResetDevice);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, status, must_change_password")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const { data: roleRows } = await supabase.from("user_roles").select("user_id, role");
      const roleMap = new Map<string, UserRow["role"]>();
      (roleRows ?? []).forEach((r: any) => roleMap.set(r.user_id, r.role));
      return (profiles ?? []).map((p: any) => ({ ...p, role: roleMap.get(p.id) ?? null })) as UserRow[];
    },
  });

  const filtered = rows.filter((r) => {
    if (filterRole !== "all" && r.role !== filterRole) return false;
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!r.email.toLowerCase().includes(q) && !(r.full_name ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const [form, setForm] = useState({
    email: "", password: randomPassword(), fullName: "", role: "student" as "admin"|"teacher"|"student", status: "active" as "active"|"inactive",
    student_no: "", program: "", year_level: 1, contact_number: "", parent_contact: "",
    teacher_no: "", position: "",
  });

  const resetForm = () => setForm({
    email: "", password: randomPassword(), fullName: "", role: "student", status: "active",
    student_no: "", program: "", year_level: 1, contact_number: "", parent_contact: "",
    teacher_no: "", position: "",
  });

  const createUser = useMutation({
    mutationFn: async () => {
      await createUserFn({
        data: {
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          status: form.status,
          studentData: form.role === "student" ? {
            student_no: form.student_no, program: form.program, year_level: form.year_level,
            contact_number: form.contact_number, parent_contact: form.parent_contact,
          } : undefined,
          teacherData: form.role === "teacher" ? {
            teacher_no: form.teacher_no, position: form.position, contact_number: form.contact_number,
          } : undefined,
        },
      });
    },
    onSuccess: () => {
      toast.success("Account created", { description: `Temporary password: ${form.password}` });
      invalidateUserCaches(qc);
      setOpen(false); resetForm();
    },
    onError: (e: Error) => toast.error("Failed to create user", { description: e.message }),
  });

  const resetPwd = useMutation({
    mutationFn: async (u: UserRow) => {
      const newPwd = randomPassword();
      await resetPwdFn({ data: { userId: u.id, newPassword: newPwd } });
      return newPwd;
    },
    onSuccess: (pwd) => {
      toast.success("Password reset", { description: `New temporary password: ${pwd}` });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleStatus = useMutation({
    mutationFn: async (u: UserRow) => {
      const next = u.status === "active" ? "inactive" : "active";
      await setStatusFn({ data: { userId: u.id, status: next } });
    },
    onSuccess: () => invalidateUserCaches(qc),
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: async ({ u, role }: { u: UserRow; role: "admin"|"teacher"|"student" }) => {
      await setRoleFn({ data: { userId: u.id, role } });
    },
    onSuccess: () => invalidateUserCaches(qc),
    onError: (e: Error) => toast.error(e.message),
  });

  const delUser = useMutation({
    mutationFn: async (u: UserRow) => { await deleteUserFn({ data: { userId: u.id } }); },
    onSuccess: () => {
      toast.success("User deleted");
      invalidateUserCaches(qc);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetDevice = useMutation({
    mutationFn: async (u: UserRow) => { await resetDeviceFn({ data: { userId: u.id } }); },
    onSuccess: () => toast.success("Device binding reset", { description: "User can register a new device on next login." }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [confirmDelete, setConfirmDelete] = useState<UserRow | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<UserRow | null>(null);
  const [confirmResetDevice, setConfirmResetDevice] = useState<UserRow | null>(null);


  return (
    <div>
      <PageHeader
        title="User Management"
        description="Provision accounts for admins, teachers, and students."
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (v) resetForm(); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1.5 h-4 w-4" />New account</Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Create user account</DialogTitle>
                <DialogDescription>
                  The user will be required to change their temporary password at first login.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Full name</Label><Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></div>
                <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div>
                  <Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="student">Student</SelectItem>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Temporary password</Label>
                  <div className="flex gap-2">
                    <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, password: randomPassword() })}>Generate</Button>
                  </div>
                </div>

                {form.role === "student" && <>
                  <div><Label>Student ID</Label><Input value={form.student_no} onChange={(e) => setForm({ ...form, student_no: e.target.value })} /></div>
                  <div><Label>Program</Label><Input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} /></div>
                  <div><Label>Year level</Label><Input type="number" value={form.year_level} onChange={(e) => setForm({ ...form, year_level: Number(e.target.value) })} /></div>
                  <div><Label>Contact #</Label><Input value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Parent contact #</Label><Input value={form.parent_contact} onChange={(e) => setForm({ ...form, parent_contact: e.target.value })} /></div>
                </>}
                {form.role === "teacher" && <>
                  <div><Label>Teacher ID</Label><Input value={form.teacher_no} onChange={(e) => setForm({ ...form, teacher_no: e.target.value })} /></div>
                  <div><Label>Position</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} /></div>
                  <div className="sm:col-span-2"><Label>Contact #</Label><Input value={form.contact_number} onChange={(e) => setForm({ ...form, contact_number: e.target.value })} /></div>
                </>}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => createUser.mutate()} disabled={!form.email || !form.fullName || createUser.isPending}>
                  {createUser.isPending ? "Creating…" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name or email…" className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto shadow-[var(--shadow-card)]">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead><TableHead>Email</TableHead>
              <TableHead>Role</TableHead><TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No users match your filters.</TableCell></TableRow>
            ) : filtered.map((u) => (
              <TableRow key={u.id} className={u.status === "inactive" ? "opacity-60" : ""}>
                <TableCell className="font-medium">
                  {u.full_name || "—"}
                  {u.must_change_password && <Badge variant="outline" className="ml-2">Must change pwd</Badge>}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">{u.email}</TableCell>
                <TableCell>
                  <Select value={u.role ?? ""} onValueChange={(v) => changeRole.mutate({ u, role: v as any })}>
                    <SelectTrigger className="h-8 w-32"><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="teacher">Teacher</SelectItem>
                      <SelectItem value="student">Student</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {u.status === "active"
                    ? <Badge className="bg-success text-success-foreground">Active</Badge>
                    : <Badge variant="secondary">Inactive</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="Reset password" onClick={() => resetPwd.mutate(u)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Reset device binding" onClick={() => {
                    if (confirm(`Reset device binding for ${u.email}? They will register a new device on next login.`)) resetDevice.mutate(u);
                  }}>
                    <Smartphone className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" title="Toggle status" onClick={() => toggleStatus.mutate(u)}>
                    {u.status === "active" ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                  </Button>
                  {u.id !== me?.id && (
                    <Button variant="ghost" size="icon" title="Delete" onClick={() => {
                      if (confirm(`Permanently delete ${u.email}? This cannot be undone.`)) delUser.mutate(u);
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
