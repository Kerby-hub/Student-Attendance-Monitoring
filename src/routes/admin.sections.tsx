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
  department_id: string | null;
  departments?: { name: string } | null;
};

function SectionsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Section | null>(null);
  const [toDelete, setToDelete] = useState<Section | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: "", program: "", year_level: 1, school_year: "2025-2026",
    department_id: "" as string,
  });
  const [search, setSearch] = useState("");
  const [fProgram, setFProgram] = useState<string>("all");
  const [fYear, setFYear] = useState<string>("all");
  const [fDept, setFDept] = useState<string>("all");

  const { data = [], isLoading } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sections")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("*, departments(name)" as any)
        .order("school_year", { ascending: false })
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Section[];
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

  // Dependent options: Department → Program → Year
  const programOptions = useMemo(
    () => Array.from(new Set(
      data
        .filter((s) => fDept === "all" || (s.department_id ?? "") === fDept)
        .map((s) => s.program)
        .filter((p): p is string => !!p),
    )).sort(),
    [data, fDept],
  );
  const yearOptions = useMemo(
    () => Array.from(new Set(
      data
        .filter((s) => fDept === "all" || (s.department_id ?? "") === fDept)
        .filter((s) => fProgram === "all" || (s.program ?? "") === fProgram)
        .map((s) => s.year_level)
        .filter((y): y is number => y != null),
    )).sort((a, b) => a - b),
    [data, fDept, fProgram],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((s) => {
      if (fDept !== "all" && (s.department_id ?? "") !== fDept) return false;
      if (fProgram !== "all" && (s.program ?? "") !== fProgram) return false;
      if (fYear !== "all" && String(s.year_level ?? "") !== fYear) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.program ?? "").toLowerCase().includes(q) ||
        String(s.year_level ?? "").includes(q) ||
        s.school_year.toLowerCase().includes(q) ||
        (s.departments?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, fProgram, fYear, fDept]);
  const changeDept = (v: string) => { setFDept(v); setFProgram("all"); setFYear("all"); };
  const changeProgram = (v: string) => { setFProgram(v); setFYear("all"); };
  const resetFilters = () => { setSearch(""); setFProgram("all"); setFYear("all"); setFDept("all"); };

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
        department_id: form.department_id || null,
      };
      if (editing) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("sections").update(payload as any).eq("id", editing.id);
        if (error) throw error;
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await supabase.from("sections").insert(payload as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Section updated" : "Section created");
      qc.invalidateQueries({ queryKey: ["sections"] });
      setOpen(false); setEditing(null); setErrors({});
      setForm({ name: "", program: "", year_level: 1, school_year: "2025-2026", department_id: "" });
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

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", program: "", year_level: 1, school_year: "2025-2026", department_id: "" });
    setOpen(true);
  };
  const openEdit = (s: Section) => {
    setEditing(s);
    setForm({
      name: s.name, program: s.program ?? "", year_level: s.year_level ?? 1,
      school_year: s.school_year, department_id: s.department_id ?? "",
    });
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
                  <Label>Department</Label>
                  <Select value={form.department_id || "none"} onValueChange={(v) => setForm({ ...form, department_id: v === "none" ? "" : v, program: "" })}>
                    <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No Department</SelectItem>
                      {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Program/Course</Label>
                  {(() => {
                    const opts = Array.from(new Set(
                      data
                        .filter((s) => !form.department_id || (s.department_id ?? "") === form.department_id)
                        .map((s) => s.program)
                        .filter((p): p is string => !!p),
                    )).sort();
                    const listId = `sections-form-programs-${form.department_id || "any"}`;
                    return (
                      <>
                        <Input
                          value={form.program}
                          list={listId}
                          onChange={(e) => setForm({ ...form, program: e.target.value })}
                          placeholder="BSCS"
                        />
                        <datalist id={listId}>
                          {opts.map((p) => <option key={p} value={p} />)}
                        </datalist>
                      </>
                    );
                  })()}
                </div>
                <div>
                  <Label>Year level<span className="text-destructive"> *</span></Label>
                  <Select
                    value={form.year_level ? String(form.year_level) : ""}
                    onValueChange={(v) => { setForm({ ...form, year_level: Number(v) }); if (errors.year_level) setErrors((er) => { const n = { ...er }; delete n.year_level; return n; }); }}
                  >
                    <SelectTrigger aria-invalid={!!errors.year_level}><SelectValue placeholder="Select Year Level" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1st Year</SelectItem>
                      <SelectItem value="2">2nd Year</SelectItem>
                      <SelectItem value="3">3rd Year</SelectItem>
                      <SelectItem value="4">4th Year</SelectItem>
                      <SelectItem value="5">5th Year</SelectItem>
                    </SelectContent>
                  </Select>
                  {errors.year_level && <p className="mt-1 text-xs text-destructive">{errors.year_level}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label>Section name<span className="text-destructive"> *</span></Label>
                  <Input value={form.name} aria-invalid={!!errors.name}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); if (errors.name) setErrors((er) => { const n = { ...er }; delete n.name; return n; }); }}
                    placeholder="BSCS 1-A" />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
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
        <Select value={fDept} onValueChange={changeDept}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={depts.length === 0 ? "No records added." : "Select Department"} /></SelectTrigger>
          <SelectContent>
            {depts.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
            ) : depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fProgram} onValueChange={changeProgram}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={programOptions.length === 0 ? "No records added." : "Select Program/Course"} /></SelectTrigger>
          <SelectContent>
            {programOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
            ) : programOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fYear} onValueChange={setFYear}>
          <SelectTrigger className="w-full sm:w-44"><SelectValue placeholder={yearOptions.length === 0 ? "No records added." : "Select Year Level"} /></SelectTrigger>
          <SelectContent>
            {yearOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
            ) : yearOptions.map((y) => <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || fProgram !== "all" || fYear !== "all" || fDept !== "all") && (
          <Button variant="ghost" size="sm" onClick={resetFilters}><X className="mr-1 h-4 w-4" />Reset filters</Button>
        )}
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Section</TableHead><TableHead>Department</TableHead>
              <TableHead>Program</TableHead>
              <TableHead>Year</TableHead><TableHead>School year</TableHead>
              <TableHead className="w-32"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                {data.length === 0 ? "No sections yet." : "No sections match your search or filters."}
              </TableCell></TableRow>
            ) : filtered.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell>{s.departments?.name ?? "—"}</TableCell>
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
