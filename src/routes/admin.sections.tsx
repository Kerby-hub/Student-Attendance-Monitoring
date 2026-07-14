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

export const Route = createFileRoute("/admin/sections")({
  component: SectionsPage,
});

type Section = {
  id: string; name: string; program: string | null;
  year_level: number | null; school_year: string;
};

function SectionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [toDelete, setToDelete] = useState<Section | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "", program: "", year_level: 1, school_year: "2025-2026",
  });

  const { data = [], isLoading } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("*").order("school_year", { ascending: false }).order("name");
      if (error) throw error;
      return data as Section[];
    },
  });

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "Section name is required.";
    if (!form.school_year.trim()) e.school_year = "School year is required.";
    if (!form.year_level || form.year_level < 1) e.year_level = "Year level must be at least 1.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const upsert = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error("Please fix the highlighted fields.");
      const payload = {
        name: form.name.trim(),
        program: form.program.trim() || null,
        year_level: form.year_level || null,
        school_year: form.school_year.trim(),
      };
      if (editing) {
        const { error } = await supabase.from("sections").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sections").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Section updated" : "Section created");
      qc.invalidateQueries({ queryKey: ["sections"] });
      setOpen(false); setEditing(null); setErrors({});
      setForm({ name: "", program: "", year_level: 1, school_year: "2025-2026" });
    },
    onError: (e: Error) => {
      if (e.message !== "Please fix the highlighted fields.") toast.error(e.message);
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sections").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["sections"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm({ name: "", program: "", year_level: 1, school_year: "2025-2026" }); setOpen(true); };
  const openEdit = (s: Section) => {
    setEditing(s);
    setForm({ name: s.name, program: s.program ?? "", year_level: s.year_level ?? 1, school_year: s.school_year });
    setOpen(true);
  };

  return (
    <div>
      <PageHeader
        title="Sections"
        description="Create class sections grouped by year level and school year."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New section</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit section" : "New section"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label>Section name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="BSCS 1-A" /></div>
                <div><Label>Program</Label><Input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="BSCS" /></div>
                <div><Label>Year level</Label><Input type="number" min={1} max={10} value={form.year_level} onChange={(e) => setForm({ ...form, year_level: Number(e.target.value) })} /></div>
                <div className="sm:col-span-2"><Label>School year</Label><Input value={form.school_year} onChange={(e) => setForm({ ...form, school_year: e.target.value })} placeholder="2025-2026" /></div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => upsert.mutate()} disabled={!form.name || !form.school_year || upsert.isPending}>{editing ? "Save" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Section</TableHead><TableHead>Program</TableHead>
              <TableHead>Year</TableHead><TableHead>School year</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No sections yet.</TableCell></TableRow>
            ) : data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.program ?? "—"}</TableCell>
                <TableCell>{s.year_level ?? "—"}</TableCell>
                <TableCell>{s.school_year}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this section?")) remove.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
