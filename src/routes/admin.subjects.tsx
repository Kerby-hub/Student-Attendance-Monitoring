import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
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

export const Route = createFileRoute("/admin/subjects")({
  component: SubjectsPage,
});

type Subject = {
  id: string; code: string; name: string; description: string | null;
  units: number; department_id: string | null; archived: boolean;
};

function SubjectsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subject | null>(null);
  const [toDelete, setToDelete] = useState<Subject | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const [form, setForm] = useState({
    code: "", name: "", description: "", units: 3, department_id: "" as string | "",
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["subjects"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subjects").select("*").order("code");
      if (error) throw error;
      return data as Subject[];
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

  const upsert = useMutation({
    mutationFn: async () => {
  function validate() {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Code is required.";
    if (!form.name.trim()) e.name = "Name is required.";
    if (!Number.isFinite(form.units) || form.units <= 0) e.units = "Units must be greater than 0.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const upsert = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("VALIDATION");
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        units: form.units,
        department_id: form.department_id || null,
      };
      if (editing) {
        const { error } = await supabase.from("subjects").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("subjects").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Subject updated" : "Subject created");
      qc.invalidateQueries({ queryKey: ["subjects"] });
      setOpen(false); setEditing(null); setErrors({});
      setForm({ code: "", name: "", description: "", units: 3, department_id: "" });
    },
    onError: (e: Error) => { if (e.message !== "VALIDATION") toast.error(e.message); },
  });

  const toggleArchive = useMutation({
    mutationFn: async (s: Subject) => {
      const { error } = await supabase.from("subjects").update({ archived: !s.archived }).eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["subjects"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("subjects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Subject deleted");
      qc.invalidateQueries({ queryKey: ["subjects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", description: "", units: 3, department_id: "" });
    setOpen(true);
  };
  const openEdit = (s: Subject) => {
    setEditing(s);
    setForm({
      code: s.code, name: s.name, description: s.description ?? "",
      units: Number(s.units), department_id: s.department_id ?? "",
    });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Manage subjects offered across departments."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New subject</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit subject" : "New subject"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div><Label>Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="CS101" /></div>
                <div><Label>Units</Label><Input type="number" step="0.5" value={form.units} onChange={(e) => setForm({ ...form, units: Number(e.target.value) })} /></div>
                <div className="sm:col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Intro to Computing" /></div>
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
                <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => upsert.mutate()} disabled={!form.code || !form.name || upsert.isPending}>
                  {editing ? "Save" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead><TableHead>Name</TableHead>
              <TableHead>Units</TableHead><TableHead>Status</TableHead>
              <TableHead className="w-44"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No subjects yet.</TableCell></TableRow>
            ) : data.map((s) => (
              <TableRow key={s.id} className={s.archived ? "opacity-60" : ""}>
                <TableCell className="font-mono text-sm">{s.code}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell>{Number(s.units)}</TableCell>
                <TableCell>
                  {s.archived ? <Badge variant="secondary">Archived</Badge> : <Badge>Active</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => toggleArchive.mutate(s)}>
                    {s.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this subject?")) remove.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
