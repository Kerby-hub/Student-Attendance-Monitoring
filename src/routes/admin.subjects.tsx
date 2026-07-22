import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { X } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [fDept, setFDept] = useState<string>("all");
  const [fProgram, setFProgram] = useState<string>("all");

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

  const { data: programsList = [] } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from("programs" as any).select("id, code, name, department_id, status").order("code");
      if (error) throw error;
      return (data ?? []) as unknown as { id: string; code: string; name: string; department_id: string; status: string }[];
    },
  });

  // Map subject_id → set of programs it is scheduled for, derived from
  // class_schedules → sections.program. Enables filtering subjects by Program/Course.
  const { data: subjectPrograms = { map: new Map<string, Set<string>>() } } = useQuery({
    queryKey: ["subject-programs"],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await supabase.from("class_schedules").select("subject_id, sections(program)" as any);
      if (error) throw error;
      const map = new Map<string, Set<string>>();
      for (const row of (data ?? []) as unknown as { subject_id: string; sections: { program: string | null } | null }[]) {
        const p = row.sections?.program?.trim();
        if (!p) continue;
        const set = map.get(row.subject_id) ?? new Set<string>();
        set.add(p);
        map.set(row.subject_id, set);
      }
      return { map };
    },
  });

  const programOptions = useMemo(() => {
    return programsList
      .filter((p) => p.status === "active" && (fDept === "all" || p.department_id === fDept))
      .map((p) => p.code);
  }, [programsList, fDept]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return data.filter((s) => {
      if (fDept !== "all" && (s.department_id ?? "") !== fDept) return false;
      if (fProgram !== "all") {
        const progs = subjectPrograms.map.get(s.id);
        if (!progs || !progs.has(fProgram)) return false;
      }
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.description ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, fDept, fProgram, subjectPrograms]);
  const resetFilters = () => { setSearch(""); setFDept("all"); setFProgram("all"); };

  function validate() {
    const e: Record<string, string> = {};
    if (!form.code.trim()) e.code = "Code is required.";
    if (!form.name.trim()) e.name = "Name is required.";
    if (!Number.isFinite(form.units) || form.units <= 0) e.units = "Units must be greater than 0.";
    if (!form.department_id) e.department_id = "Please select a department.";
    setErrors(e);
    if (Object.keys(e).length > 0) {
      setTimeout(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
    }
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
    onError: (e: Error) => {
      if (/foreign key|violates|referenced/i.test(e.message))
        toast.error("This subject is linked to schedules and cannot be deleted. Archive it instead.");
      else toast.error(e.message);
    },
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
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setErrors({}); }}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New subject</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Edit subject" : "New subject"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Code<span className="text-destructive"> *</span></Label>
                  <Input value={form.code} aria-invalid={!!errors.code}
                    onChange={(e) => { setForm({ ...form, code: e.target.value }); clearErr("code"); }} placeholder="CS101" />
                  {errors.code && <p className="mt-1 text-xs text-destructive">{errors.code}</p>}
                </div>
                <div>
                  <Label>Units<span className="text-destructive"> *</span></Label>
                  <Input type="number" step="0.5" value={form.units} aria-invalid={!!errors.units}
                    onChange={(e) => { setForm({ ...form, units: Number(e.target.value) }); clearErr("units"); }} />
                  {errors.units && <p className="mt-1 text-xs text-destructive">{errors.units}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label>Name<span className="text-destructive"> *</span></Label>
                  <Input value={form.name} aria-invalid={!!errors.name}
                    onChange={(e) => { setForm({ ...form, name: e.target.value }); clearErr("name"); }} placeholder="Intro to Computing" />
                  {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
                </div>
                <div className="sm:col-span-2">
                  <Label>Department<span className="text-destructive"> *</span></Label>
                  <Select value={form.department_id || undefined} onValueChange={(v) => { setForm({ ...form, department_id: v }); clearErr("department_id"); }}>
                    <SelectTrigger aria-invalid={!!errors.department_id}><SelectValue placeholder="Select Department" /></SelectTrigger>
                    <SelectContent>
                      {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.department_id && <p className="mt-1 text-xs text-destructive">{errors.department_id}</p>}
                </div>
                <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
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
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search subjects..."
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={fDept === "all" ? undefined : fDept} onValueChange={setFDept}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={depts.length === 0 ? "No records added." : "Select Department"} /></SelectTrigger>
          <SelectContent>
            {depts.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
            ) : depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fProgram === "all" ? undefined : fProgram} onValueChange={setFProgram}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder={programOptions.length === 0 ? "No records added." : "Select Program/Course"} /></SelectTrigger>
          <SelectContent>
            {programOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
            ) : programOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || fDept !== "all" || fProgram !== "all") && (
          <Button variant="ghost" size="sm" onClick={resetFilters}><X className="mr-1 h-4 w-4" />Reset filters</Button>
        )}
      </div>
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
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                {data.length === 0 ? "No subjects yet." : "No subjects match your search or filters."}
              </TableCell></TableRow>
            ) : filtered.map((s) => (
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
        title="Delete this subject?"
        description={<>Are you sure you want to delete <span className="font-medium">{toDelete?.name}</span>? Consider archiving instead if it has historical schedules.</>}
        confirmLabel="Delete"
        loading={remove.isPending}
        loadingLabel="Deleting…"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.id, { onSettled: () => setToDelete(null) }); }}
      />
    </div>
  );
}
