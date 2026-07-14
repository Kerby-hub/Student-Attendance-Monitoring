import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Pencil, UserX, UserCheck, Settings2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser, adminSetStatus, adminUpdateUserProfile } from "@/lib/admin/users.functions";
import { invalidateUserCaches } from "@/lib/admin/invalidate";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { TempPasswordDialog, generateTempPassword } from "@/components/admin/TempPasswordDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/teachers")({
  component: TeachersPage,
});

type Teacher = {
  id: string; teacher_no: string; full_name: string; email: string;
  position: string | null; department_id: string | null;
  user_id: string | null;
  status: "active" | "inactive";
  departments?: { name: string } | null;
};

function TeachersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [assignFor, setAssignFor] = useState<Teacher | null>(null);
  const [deactivateTarget, setDeactivateTarget] = useState<Teacher | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<Teacher | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("active");
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const [form, setForm] = useState({
    teacher_no: "", full_name: "", email: "", position: "", department_id: "" as string | "",
    temp_password: "",
  });
  const [credentials, setCredentials] = useState<{ email: string; password: string } | null>(null);
  const createUserFn = useServerFn(adminCreateUser);
  const setStatusFn = useServerFn(adminSetStatus);
  const updateProfileFn = useServerFn(adminUpdateUserProfile);

  const { data = [], isLoading } = useQuery({
    queryKey: ["teachers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("teachers")
        .select("*, departments(name)")
        .order("full_name");
      if (error) throw error;
      return data as unknown as Teacher[];
    },
  });

  const { data: depts = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (editing && !form.teacher_no.trim()) e.teacher_no = "Teacher ID is required.";
    if (!form.full_name.trim()) e.full_name = "Full name is required.";
    if (!form.email.trim()) e.email = "Email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Invalid email address.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const upsert = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("VALIDATION");
      const trimmedEmail = form.email.trim().toLowerCase();
      if (editing) {
        // Only check duplicate email if it changed.
        const currentEmail = (editing.email ?? "").trim().toLowerCase();
        if (trimmedEmail && trimmedEmail !== currentEmail) {
          const { data: dupEmail } = await supabase
            .from("teachers").select("id").ilike("email", trimmedEmail).neq("id", editing.id).maybeSingle();
          if (dupEmail) {
            setErrors((er) => ({ ...er, email: "Email already exists." }));
            throw new Error("EMAIL_TAKEN");
          }
        }
        // Duplicate teacher_no on change
        if (form.teacher_no.trim() && form.teacher_no.trim() !== editing.teacher_no) {
          const { data: dupNo } = await supabase
            .from("teachers").select("id").eq("teacher_no", form.teacher_no.trim()).neq("id", editing.id).maybeSingle();
          if (dupNo) {
            setErrors((er) => ({ ...er, teacher_no: "Teacher ID already exists." }));
            throw new Error("TEACHER_NO_TAKEN");
          }
        }
        const payload = {
          teacher_no: form.teacher_no.trim(),
          full_name: form.full_name.trim(),
          email: trimmedEmail,
          position: form.position.trim() || null,
          department_id: form.department_id || null,
        };
        const { error } = await supabase.from("teachers").update(payload).eq("id", editing.id);
        if (error) {
          if ((error as { code?: string }).code === "23505") {
            const msg = error.message;
            if (/teacher_no/i.test(msg)) {
              setErrors((er) => ({ ...er, teacher_no: "Teacher ID already exists." }));
              throw new Error("TEACHER_NO_TAKEN");
            }
            if (/email/i.test(msg)) {
              setErrors((er) => ({ ...er, email: "Email already exists." }));
              throw new Error("EMAIL_TAKEN");
            }
          }
          throw error;
        }
        if (editing.user_id) {
          try {
            await updateProfileFn({
              data: {
                userId: editing.user_id,
                fullName: form.full_name.trim(),
                email: trimmedEmail || undefined,
              },
            });
          } catch (e) {
            const msg = (e as Error).message || "";
            if (/EMAIL_TAKEN/.test(msg)) {
              setErrors((er) => ({ ...er, email: "Email already exists." }));
              throw new Error("EMAIL_TAKEN");
            }
          }
        }
        return null;
      }

      const email = trimmedEmail;
      if (!email) throw new Error("Email is required to create a login account.");
      const password = form.temp_password.trim() || generateTempPassword();
      if (password.length < 8) throw new Error("Temporary password must be at least 8 characters.");

      await createUserFn({
        data: {
          email,
          password,
          fullName: form.full_name.trim(),
          role: "teacher",
          status: "active",
          teacherData: {
            teacher_no: form.teacher_no.trim(),
            position: form.position.trim() || undefined,
            department_id: form.department_id || null,
          },
        },
      });
      return { email, password };
    },
    onSuccess: (result) => {
      toast.success(editing ? "Teacher updated" : "Teacher created");
      invalidateUserCaches(qc);
      setOpen(false); setEditing(null); setErrors({});
      setForm({ teacher_no: "", full_name: "", email: "", position: "", department_id: "", temp_password: "" });
      if (result) setCredentials(result);
    },
    onError: (e: Error) => {
      const msg = e.message || "Failed to save";
      if (msg === "VALIDATION") return;
      if (/TEACHER_NO_TAKEN/.test(msg)) {
        setErrors((er) => ({ ...er, teacher_no: "Teacher ID already exists." }));
        toast.error("Teacher ID already exists");
      } else if (/EMAIL_TAKEN/.test(msg) || /already registered|already exists|duplicate/i.test(msg)) {
        setErrors((er) => ({ ...er, email: "Email already exists." }));
        toast.error("Email already exists");
      } else if (/invalid.*email/i.test(msg)) toast.error("Invalid email");
      else if (/password/i.test(msg) && /weak|short|length/i.test(msg)) toast.error("Password too weak");
      else toast.error(msg.replace(/^[A-Z_]+:\s*/, ""));
    },
  });

  const toggleStatus = useMutation({
    mutationFn: async (t: Teacher) => {
      const next = t.status === "active" ? "inactive" : "active";
      const { error } = await supabase.from("teachers").update({ status: next }).eq("id", t.id);
      if (error) throw error;
      if (t.user_id) {
        try { await setStatusFn({ data: { userId: t.user_id, status: next } }); } catch { /* non-fatal */ }
      }
    },
    onSuccess: () => {
      invalidateUserCaches(qc);
      toast.success("Teacher status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ teacher_no: "", full_name: "", email: "", position: "", department_id: "", temp_password: generateTempPassword() });
    setOpen(true);
  };
  const openEdit = (t: Teacher) => {
    setEditing(t);
    setForm({
      teacher_no: t.teacher_no, full_name: t.full_name, email: t.email,
      position: t.position ?? "", department_id: t.department_id ?? "",
      temp_password: "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Teachers"
        description="Create teacher records and assign subjects, sections, and schedules."
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setErrors({}); }}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New teacher</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit teacher" : "New teacher"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Teacher ID{editing && <span className="text-destructive"> *</span>} <span className="text-xs text-muted-foreground">(auto if blank)</span></Label>
                  <Input value={form.teacher_no} aria-invalid={!!errors.teacher_no}
                    onChange={(e) => { setForm({ ...form, teacher_no: e.target.value }); clearErr("teacher_no"); }}
                    placeholder="Auto-generated, e.g. TCH-2026-0001" disabled={!editing} />
                  {errors.teacher_no && <p className="mt-1 text-xs text-destructive">{errors.teacher_no}</p>}
                </div>
                <div><Label>Position</Label><Input value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="Instructor" /></div>
                <div className="sm:col-span-2">
                  <Label>Full name<span className="text-destructive"> *</span></Label>
                  <Input value={form.full_name} aria-invalid={!!errors.full_name}
                    onChange={(e) => { setForm({ ...form, full_name: e.target.value }); clearErr("full_name"); }} />
                  {errors.full_name && <p className="mt-1 text-xs text-destructive">{errors.full_name}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label>Email<span className="text-destructive"> *</span></Label>
                  <Input type="email" value={form.email} aria-invalid={!!errors.email}
                    onChange={(e) => { setForm({ ...form, email: e.target.value }); clearErr("email"); }} />
                  {errors.email && <p className="mt-1 text-xs text-destructive">{errors.email}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label>Department</Label>
                  <Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v })}>
                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {!editing && (
                  <div className="sm:col-span-2">
                    <Label>Temporary password</Label>
                    <div className="flex gap-2">
                      <Input
                        value={form.temp_password}
                        onChange={(e) => setForm({ ...form, temp_password: e.target.value })}
                        placeholder="Auto-generated"
                        className="font-mono"
                      />
                      <Button type="button" variant="outline" onClick={() => setForm({ ...form, temp_password: generateTempPassword() })}>
                        <RefreshCw className="mr-1.5 h-4 w-4" />Generate
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Teacher will be required to change this on first login.
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>
                  {upsert.isPending ? "Saving…" : editing ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <TempPasswordDialog
        open={!!credentials}
        onClose={() => setCredentials(null)}
        email={credentials?.email ?? ""}
        password={credentials?.password ?? ""}
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="Search name, email, or ID…"
          className="flex-1"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="Select status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            <SelectItem value="all">All statuses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead><TableHead>Name</TableHead>
              <TableHead>Email</TableHead><TableHead>Department</TableHead>
              <TableHead>Status</TableHead><TableHead className="w-44"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : (() => {
              const q = search.trim().toLowerCase();
              const filtered = data.filter((t) => {
                if (filterStatus !== "all" && t.status !== filterStatus) return false;
                if (!q) return true;
                return (
                  t.full_name.toLowerCase().includes(q) ||
                  (t.email ?? "").toLowerCase().includes(q) ||
                  t.teacher_no.toLowerCase().includes(q)
                );
              });
              if (filtered.length === 0) {
                return <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No teachers match the filters.</TableCell></TableRow>;
              }
              return filtered.map((t) => (
                <TableRow key={t.id} className={t.status === "inactive" ? "opacity-60" : ""}>
                  <TableCell className="font-mono text-sm">{t.teacher_no}</TableCell>
                  <TableCell className="font-medium">{t.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.email}</TableCell>
                  <TableCell>{t.departments?.name ?? "—"}</TableCell>
                  <TableCell>
                    {t.status === "active" ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.status === "active" ? (
                      <>
                        <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(t)}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Assignments" onClick={() => setAssignFor(t)}><Settings2 className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" title="Deactivate" onClick={() => setDeactivateTarget(t)}>
                          <UserX className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <Button variant="ghost" size="sm" title="Restore" onClick={() => setRestoreTarget(t)}>
                        <UserCheck className="mr-1 h-4 w-4" /> Restore
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ));
            })()}
          </TableBody>
        </Table>
      </div>

      <AssignmentsDialog teacher={assignFor} onClose={() => setAssignFor(null)} />

      <ConfirmDialog
        open={!!deactivateTarget}
        onOpenChange={(v) => { if (!v) setDeactivateTarget(null); }}
        title="Deactivate teacher?"
        description={<>Are you sure you want to deactivate <span className="font-medium">{deactivateTarget?.full_name}</span>? They will no longer be able to access the system. Historical records will be preserved.</>}
        confirmLabel="Deactivate"
        loading={toggleStatus.isPending}
        loadingLabel="Deactivating…"
        onConfirm={() => { if (deactivateTarget) { const t = deactivateTarget; toggleStatus.mutate(t, { onSettled: () => setDeactivateTarget(null) }); } }}
      />

      <ConfirmDialog
        open={!!restoreTarget}
        onOpenChange={(v) => { if (!v) setRestoreTarget(null); }}
        title="Restore Teacher Account?"
        description={<>Are you sure you want to restore this teacher account? The teacher will be able to access the system again after restoration.</>}
        confirmLabel="Restore"
        destructive={false}
        loading={toggleStatus.isPending}
        loadingLabel="Restoring…"
        onConfirm={() => { if (restoreTarget) { const t = restoreTarget; toggleStatus.mutate(t, { onSettled: () => setRestoreTarget(null) }); } }}
      />
    </div>
  );
}

function AssignmentsDialog({ teacher, onClose }: { teacher: Teacher | null; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-active"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("id, code, name").eq("archived", false).order("code");
      if (error) throw error;
      return data as { id: string; code: string; name: string }[];
    },
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("id, name, school_year").order("name");
      if (error) throw error;
      return data as { id: string; name: string; school_year: string }[];
    },
  });

  const { data: assignedSubjects = [] } = useQuery({
    queryKey: ["teacher-subjects", teacher?.id],
    enabled: !!teacher,
    queryFn: async () => {
      const { data, error } = await supabase.from("teacher_subjects").select("subject_id").eq("teacher_id", teacher!.id);
      if (error) throw error;
      return (data as { subject_id: string }[]).map((r) => r.subject_id);
    },
  });
  const { data: assignedSections = [] } = useQuery({
    queryKey: ["teacher-sections", teacher?.id],
    enabled: !!teacher,
    queryFn: async () => {
      const { data, error } = await supabase.from("teacher_sections").select("section_id").eq("teacher_id", teacher!.id);
      if (error) throw error;
      return (data as { section_id: string }[]).map((r) => r.section_id);
    },
  });

  const toggleSubject = useMutation({
    mutationFn: async ({ subject_id, on }: { subject_id: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("teacher_subjects").insert({ teacher_id: teacher!.id, subject_id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("teacher_subjects").delete()
          .eq("teacher_id", teacher!.id).eq("subject_id", subject_id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-subjects", teacher?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSection = useMutation({
    mutationFn: async ({ section_id, on }: { section_id: string; on: boolean }) => {
      if (on) {
        const { error } = await supabase.from("teacher_sections").insert({ teacher_id: teacher!.id, section_id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from("teacher_sections").delete()
          .eq("teacher_id", teacher!.id).eq("section_id", section_id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teacher-sections", teacher?.id] }),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!teacher} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Assignments — {teacher?.full_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold">Subjects</h3>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
              {subjects.length === 0 && <p className="text-sm text-muted-foreground">No subjects.</p>}
              {subjects.map((s) => {
                const on = assignedSubjects.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={on} onCheckedChange={(v) => toggleSubject.mutate({ subject_id: s.id, on: !!v })} />
                    <span className="font-mono text-xs">{s.code}</span> {s.name}
                  </label>
                );
              })}
            </div>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold">Sections</h3>
            <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border p-3">
              {sections.length === 0 && <p className="text-sm text-muted-foreground">No sections.</p>}
              {sections.map((s) => {
                const on = assignedSections.includes(s.id);
                return (
                  <label key={s.id} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={on} onCheckedChange={(v) => toggleSection.mutate({ section_id: s.id, on: !!v })} />
                    {s.name} <span className="text-xs text-muted-foreground">({s.school_year})</span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
