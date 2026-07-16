import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, X } from "lucide-react";
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
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
  const [search, setSearch] = useState("");
  const [fProgram, setFProgram] = useState<string>("all");
  const [fYear, setFYear] = useState<string>("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("*").order("school_year", { ascending: false }).order("name");
      if (error) throw error;
      return data as Section[];
    },
  });

  const programOptions = useMemo(
    () => Array.from(new Set(data.map((s) => s.program).filter((p): p is string => !!p))).sort(),
    [data],
  );
  const yearOptions = useMemo(
    () => Array.from(new Set(data.map((s) => s.year_level).filter((y): y is number => y != null))).sort((a, b) => a - b),
    [data],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((s) => {
      if (fProgram !== "all" && (s.program ?? "") !== fProgram) return false;
      if (fYear !== "all" && String(s.year_level ?? "") !== fYear) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.program ?? "").toLowerCase().includes(q) ||
        String(s.year_level ?? "").includes(q) ||
        s.school_year.toLowerCase().includes(q)
      );
    });
  }, [data, search, fProgram, fYear]);
  const resetFilters = () => { setSearch(""); setFProgram("all"); setFYear("all"); };

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
    onSuccess: () => { toast.success("Section deleted"); qc.invalidateQueries({ queryKey: ["sections"] }); },
    onError: (e: Error) => {
      if (/foreign key|violates|referenced/i.test(e.message)) {
        toast.error("This section is linked to existing data and cannot be deleted. Consider archiving instead.");
      } else toast.error(e.message);
    },
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
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setErrors({}); }}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New section</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit section" : "New section"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Section name<span className="text-destructive"> *</span></Label>
                  <Input value={form.name} aria-invalid={!!errors.name}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); if (errors.name) setErrors((er) => { const n = { ...er }; delete n.name; return n; }); }}
                    placeholder="BSCS 1-A" />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                </div>
                <div><Label>Program</Label><Input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="BSCS" /></div>
                <div>
                  <Label>Year level<span className="text-destructive"> *</span></Label>
                  <Input type="number" min={1} max={10} value={form.year_level} aria-invalid={!!errors.year_level}
                    onChange={(e) => { setForm({ ...form, year_level: Number(e.target.value) }); if (errors.year_level) setErrors((er) => { const n = { ...er }; delete n.year_level; return n; }); }} />
                  {errors.year_level && <p className="mt-1 text-xs text-destructive">{errors.year_level}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label>School year<span className="text-destructive"> *</span></Label>
                  <Input value={form.school_year} aria-invalid={!!errors.school_year}
                    onChange={(e) => { setForm({ ...form, school_year: e.target.value }); if (errors.school_year) setErrors((er) => { const n = { ...er }; delete n.school_year; return n; }); }}
                    placeholder="2025-2026" />
                  {errors.school_year && <p className="mt-1 text-xs text-destructive">{errors.school_year}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={() => upsert.mutate()} disabled={upsert.isPending}>{upsert.isPending ? "Saving…" : editing ? "Save" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search sections..."
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={fProgram} onValueChange={setFProgram}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All Programs/Courses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs/Courses</SelectItem>
            {programOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fYear} onValueChange={setFYear}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder="All Year Levels" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Year Levels</SelectItem>
            {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || fProgram !== "all" || fYear !== "all") && (
          <Button variant="ghost" size="sm" onClick={resetFilters}><X className="mr-1 h-4 w-4" />Reset filters</Button>
        )}
      </div>
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
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {data.length === 0 ? "No sections yet." : "No sections match your search or filters."}
              </TableCell></TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.program ?? "—"}</TableCell>
                <TableCell>{s.year_level ?? "—"}</TableCell>
                <TableCell>{s.school_year}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete(s)}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => { if (!v) setToDelete(null); }}
        title="Delete this section?"
        description={<>Are you sure you want to delete <span className="font-medium">{toDelete?.name}</span>? This action cannot be undone and may affect linked schedules or students.</>}
        confirmLabel="Delete"
        loading={remove.isPending}
        loadingLabel="Deleting…"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id, { onSettled: () => setToDelete(null) }); }}
      />
    </div>
  );
}
