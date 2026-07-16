import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/departments")({
  component: DepartmentsPage,
});

type Dept = { id: string; name: string; code: string };

const Req = () => <span className="text-destructive"> *</span>;

function DepartmentsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dept | null>(null);
  const [toDelete, setToDelete] = useState<Dept | null>(null);
  const [form, setForm] = useState({ name: "", code: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  const { data = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("*").order("name");
      if (error) throw error;
      return data as Dept[];
    },
  });

  const filtered = data.filter((d) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return d.name.toLowerCase().includes(q) || d.code.toLowerCase().includes(q);
  });

  function validate() {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Code is required.";
    if (!form.name.trim()) e.name = "Name is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const upsert = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("VALIDATION");
      const payload = { code: form.code.trim(), name: form.name.trim() };
      if (editing) {
        const { error } = await supabase.from("departments").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("departments").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Department updated" : "Department created");
      qc.invalidateQueries({ queryKey: ["departments"] });
      setOpen(false);
      setEditing(null);
      setForm({ name: "", code: "" });
      setErrors({});
    },
    onError: (e: Error) => { if (e.message !== "VALIDATION") toast.error(e.message); },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("departments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Department deleted");
      qc.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (e: Error) => {
      if (/foreign key|violates|referenced/i.test(e.message))
        toast.error("This department is linked to teachers or subjects and cannot be deleted.");
      else toast.error(e.message);
    },
  });

  const openCreate = () => { setEditing(null); setForm({ name: "", code: "" }); setErrors({}); setOpen(true); };
  const openEdit = (d: Dept) => { setEditing(d); setForm({ name: d.name, code: d.code }); setErrors({}); setOpen(true); };

  return (
    <div>
      <PageHeader
        title="Departments"
        description="Organize teachers and subjects by department."
        action={
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setErrors({}); }}>
            <DialogTrigger asChild>
              <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editing ? "Edit department" : "New department"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Code<Req /></Label>
                  <Input value={form.code} aria-invalid={!!errors.code}
                    onChange={(e) => { setForm({ ...form, code: e.target.value }); clearErr("code"); }}
                    placeholder="CS" />
                  {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
                </div>
                <div>
                  <Label>Name<Req /></Label>
                  <Input value={form.name} aria-invalid={!!errors.name}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); clearErr("name"); }}
                    placeholder="Computer Science" />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
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
      <div className="mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search departments..."
          className="max-w-sm"
        />
      </div>
      <div className="mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search departments..."
          className="max-w-sm"
        />
      </div>
      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow><TableHead>Code</TableHead><TableHead>Name</TableHead><TableHead className="w-32"></TableHead></TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">
                {search ? "No departments match your search." : "No departments yet."}
              </TableCell></TableRow>
            ) : filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="font-mono text-sm">{d.code}</TableCell>
                <TableCell>{d.name}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(d)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => { if (!v) setToDelete(null); }}
        title="Delete this department?"
        description={<>Are you sure you want to delete <span className="font-medium">{toDelete?.name}</span>? Linked teachers and subjects may block this action.</>}
        confirmLabel="Delete"
        loading={remove.isPending}
        loadingLabel="Deleting…"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id, { onSettled: () => setToDelete(null) }); }}
      />
    </div>
  );
}
