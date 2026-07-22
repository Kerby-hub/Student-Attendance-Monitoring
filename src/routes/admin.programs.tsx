import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/programs")({
  component: ProgramsPage,
});

type Program = {
  id: string;
  department_id: string;
  code: string;
  name: string;
  description: string | null;
  status: "active" | "inactive";
};

type Dept = { id: string; name: string; code: string };

const Req = () => <span className="text-destructive"> *</span>;

function ProgramsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Program | null>(null);
  const [toDelete, setToDelete] = useState<Program | null>(null);
  const [form, setForm] = useState({
    department_id: "",
    code: "",
    name: "",
    description: "",
    status: "active" as "active" | "inactive",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [fDept, setFDept] = useState<string>("all");
  const clearErr = (k: string) =>
    setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  const { data: depts = [] } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name, code").order("name");
      if (error) throw error;
      return data as Dept[];
    },
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from("programs" as any).select("*").order("code");
      if (error) throw error;
      return (data ?? []) as unknown as Program[];
    },
  });

  const deptById = useMemo(() => {
    const m = new Map<string, Dept>();
    depts.forEach((d) => m.set(d.id, d));
    return m;
  }, [depts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((p) => {
      if (fDept !== "all" && p.department_id !== fDept) return false;
      if (!q) return true;
      const deptName = deptById.get(p.department_id)?.name ?? "";
      return (
        p.code.toLowerCase().includes(q) ||
        p.name.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        deptName.toLowerCase().includes(q)
      );
    });
  }, [data, search, fDept, deptById]);

  function validate() {
    const e: Record<string, string> = {};
    if (!form.department_id) e.department_id = "Department is required.";
    if (!form.code.trim()) e.code = "Program/Course Code is required.";
    if (!form.name.trim()) e.name = "Program/Course Name is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const upsert = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("VALIDATION");
      const payload = {
        department_id: form.department_id,
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        status: form.status,
      };
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("programs" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("programs" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Program/Course updated" : "Program/Course created");
      qc.invalidateQueries({ queryKey: ["programs"] });
      setOpen(false);
      setEditing(null);
      setForm({ department_id: "", code: "", name: "", description: "", status: "active" });
      setErrors({});
    },
    onError: (e: Error) => {
      if (e.message === "VALIDATION") return;
      if (/duplicate|unique|programs_dept_code/i.test(e.message)) {
        setErrors((prev) => ({ ...prev, code: "This Program/Course Code already exists in the selected Department." }));
        toast.error("Duplicate Program/Course Code under this Department.");
      } else {
        toast.error(e.message);
      }
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from("programs" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Program/Course deleted");
      qc.invalidateQueries({ queryKey: ["programs"] });
    },
    onError: (e: Error) => {
      if (/foreign key|violates|referenced/i.test(e.message)) {
        toast.error("This program is linked to existing records and cannot be deleted. Set it to Inactive instead.");
      } else {
        toast.error(e.message);
      }
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ department_id: "", code: "", name: "", description: "", status: "active" });
    setErrors({});
    setOpen(true);
  };
  const openEdit = (p: Program) => {
    setEditing(p);
    setForm({
      department_id: p.department_id,
      code: p.code,
      name: p.name,
      description: p.description ?? "",
      status: p.status,
    });
    setErrors({});
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Program/Course"
        description="Create and manage programs or courses under each department."
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setErrors({}); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit Program/Course" : "New Program/Course"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Department<Req /></Label>
                  <Select
                    value={form.department_id || undefined}
                    onValueChange={(v) => { setForm({ ...form, department_id: v }); clearErr("department_id"); }}
                  >
                    <SelectTrigger aria-invalid={!!errors.department_id}>
                      <SelectValue placeholder={depts.length === 0 ? "No records added." : "Select Department"} />
                    </SelectTrigger>
                    <SelectContent>
                      {depts.length === 0 ? (
                        <div className="px-2 py-4 text-center text-sm text-muted-foreground">No records added.</div>
                      ) : depts.map((d) => (
                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.department_id && <p className="mt-1 text-xs text-destructive">{errors.department_id}</p>}
                </div>
                <div>
                  <Label>Program/Course Code<Req /></Label>
                  <Input
                    value={form.code}
                    aria-invalid={!!errors.code}
                    onChange={(e) => { setForm({ ...form, code: e.target.value }); clearErr("code"); }}
                    placeholder="Enter program/course code, e.g. BSCS"
                  />
                  {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
                </div>
                <div>
                  <Label>Program/Course Name<Req /></Label>
                  <Input
                    value={form.name}
                    aria-invalid={!!errors.name}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); clearErr("name"); }}
                    placeholder="Enter program/course name"
                  />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Optional description"
                    rows={3}
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <Select
                    value={form.status}
                    onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search programs..."
          className="max-w-sm"
        />
        <Select value={fDept} onValueChange={setFDept}>
          <SelectTrigger className="w-full sm:w-56">
            <SelectValue placeholder={depts.length === 0 ? "No records added." : "Select Department"} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {depts.length === 0 ? (
              <div className="px-2 py-4 text-center text-sm text-muted-foreground">No records added.</div>
            ) : depts.map((d) => (
              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Department</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                {search || fDept !== "all" ? "No programs match your search." : "No records added."}
              </TableCell></TableRow>
            ) : filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono text-sm">{p.code}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{deptById.get(p.department_id)?.name ?? "—"}</TableCell>
                <TableCell className="max-w-xs truncate text-muted-foreground">{p.description ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "active" ? "default" : "secondary"}>
                    {p.status === "active" ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(p)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => { if (!v) setToDelete(null); }}
        title="Delete this Program/Course?"
        description={<>Are you sure you want to delete <span className="font-medium">{toDelete?.code}</span>? Linked students, sections, or schedules may block this action.</>}
        confirmLabel="Delete"
        loading={remove.isPending}
        loadingLabel="Deleting…"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id, { onSettled: () => setToDelete(null) }); }}
      />
    </div>
  );
}
