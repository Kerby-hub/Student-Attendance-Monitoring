import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus, Pencil, CheckCircle2, XCircle, Archive, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RequiredMark, FieldError, invalidInputClass } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { useAcademicYears, useSemesters, type AcademicYear, type Semester } from "@/lib/academic/hooks";

export const Route = createFileRoute("/admin/academic")({
  component: AcademicManagementPage,
});

function AcademicManagementPage() {
  const [tab, setTab] = useState("years");
  return (
    <div>
      <PageHeader
        title="Academic Management"
        description="Manage academic years, semesters, and student enrollments per term."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex w-full flex-wrap sm:w-auto sm:inline-flex">
          <TabsTrigger value="years"><CalendarRange className="mr-1.5 h-3.5 w-3.5" />Academic Years</TabsTrigger>
          <TabsTrigger value="semesters">Semesters</TabsTrigger>
          <TabsTrigger value="enrollments"><Users className="mr-1.5 h-3.5 w-3.5" />Enrollments</TabsTrigger>
          <TabsTrigger value="copy"><Copy className="mr-1.5 h-3.5 w-3.5" />Copy Students</TabsTrigger>
        </TabsList>
        <TabsContent value="years"><AcademicYearsTab /></TabsContent>
        <TabsContent value="semesters"><SemestersTab /></TabsContent>
        <TabsContent value="enrollments"><EnrollmentsTab /></TabsContent>
        <TabsContent value="copy"><CopyStudentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ------------------------------------------------------------------ Years
type AYForm = { name: string; start_date: string; end_date: string; status: "active" | "archived"; is_current: boolean };
const AY_EMPTY: AYForm = { name: "", start_date: "", end_date: "", status: "active", is_current: false };

function AcademicYearsTab() {
  const qc = useQueryClient();
  const { data: years = [], isLoading } = useAcademicYears();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AcademicYear | null>(null);
  const [form, setForm] = useState<AYForm>(AY_EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        is_current: form.is_current,
      };
      if (editing) {
        const { error } = await supabase.from("academic_years" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("academic_years" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Academic year updated" : "Academic year created");
      qc.invalidateQueries({ queryKey: ["academic-years"] });
      qc.invalidateQueries({ queryKey: ["current-academic-year"] });
      setOpen(false); setEditing(null); setForm(AY_EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(AY_EMPTY); setErrors({}); setOpen(true); };
  const openEdit = (y: AcademicYear) => {
    setEditing(y);
    setForm({
      name: y.name,
      start_date: y.start_date ?? "",
      end_date: y.end_date ?? "",
      status: y.status,
      is_current: y.is_current,
    });
    setErrors({});
    setOpen(true);
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Academic year name is required.";
    if (form.start_date && form.end_date && form.end_date <= form.start_date) errs.end_date = "End date must be after start date.";
    setErrors(errs);
    if (Object.keys(errs).length === 0) upsert.mutate();
  };

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New academic year</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit academic year" : "New academic year"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Name<RequiredMark /></Label>
                <Input
                  value={form.name}
                  className={cn(errors.name && invalidInputClass)}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); clearErr("name"); }}
                  placeholder="e.g. 2026-2027"
                />
                <FieldError message={errors.name} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start date</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    className={cn(errors.end_date && invalidInputClass)}
                    onChange={(e) => { setForm({ ...form, end_date: e.target.value }); clearErr("end_date"); }}
                  />
                  <FieldError message={errors.end_date} />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "archived" })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_current} onChange={(e) => setForm({ ...form, is_current: e.target.checked })} />
                Mark as current academic year
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={upsert.isPending}>{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current</TableHead>
              <TableHead className="w-16"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : years.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="py-8 text-center text-muted-foreground">No academic years yet.</TableCell></TableRow>
            ) : years.map((y) => (
              <TableRow key={y.id}>
                <TableCell className="font-medium">{y.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{y.start_date ?? "—"} → {y.end_date ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={y.status === "active" ? "default" : "outline"}>{y.status}</Badge>
                </TableCell>
                <TableCell>
                  {y.is_current ? <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"><CheckCircle2 className="mr-1 h-3 w-3" />Current</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(y)}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// -------------------------------------------------------------- Semesters
type SemForm = {
  academic_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: Semester["status"];
  is_current: boolean;
};
const SEM_EMPTY: SemForm = { academic_year_id: "", name: "", start_date: "", end_date: "", status: "draft", is_current: false };

function SemestersTab() {
  const qc = useQueryClient();
  const { data: years = [] } = useAcademicYears();
  const [yearFilter, setYearFilter] = useState<string>("all");
  const { data: semesters = [], isLoading } = useSemesters(yearFilter === "all" ? undefined : yearFilter);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Semester | null>(null);
  const [closeTarget, setCloseTarget] = useState<Semester | null>(null);
  const [form, setForm] = useState<SemForm>(SEM_EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        academic_year_id: form.academic_year_id,
        name: form.name.trim(),
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        is_current: form.is_current,
      };
      if (editing) {
        const { error } = await supabase.from("semesters" as never).update(payload as never).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("semesters" as never).insert(payload as never);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Semester updated" : "Semester created");
      qc.invalidateQueries({ queryKey: ["semesters"] });
      qc.invalidateQueries({ queryKey: ["current-semester"] });
      setOpen(false); setEditing(null); setForm(SEM_EMPTY);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status, is_current }: { id: string; status?: Semester["status"]; is_current?: boolean }) => {
      const patch: Record<string, unknown> = {};
      if (status !== undefined) patch.status = status;
      if (is_current !== undefined) patch.is_current = is_current;
      const { error } = await supabase.from("semesters" as never).update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["semesters"] });
      qc.invalidateQueries({ queryKey: ["current-semester"] });
      toast.success("Semester updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm({ ...SEM_EMPTY, academic_year_id: yearFilter !== "all" ? yearFilter : years[0]?.id ?? "" });
    setErrors({});
    setOpen(true);
  };
  const openEdit = (s: Semester) => {
    setEditing(s);
    setForm({
      academic_year_id: s.academic_year_id,
      name: s.name,
      start_date: s.start_date ?? "",
      end_date: s.end_date ?? "",
      status: s.status,
      is_current: s.is_current,
    });
    setErrors({});
    setOpen(true);
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.academic_year_id) errs.academic_year_id = "Academic year is required.";
    if (!form.name.trim()) errs.name = "Semester name is required.";
    if (form.start_date && form.end_date && form.end_date <= form.start_date) errs.end_date = "End date must be after start date.";
    setErrors(errs);
    if (Object.keys(errs).length === 0) upsert.mutate();
  };

  const yearName = (id: string) => years.find((y) => y.id === id)?.name ?? "—";

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className="w-56">
          <Label>Filter by academic year</Label>
          <Select value={yearFilter} onValueChange={setYearFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} disabled={years.length === 0}><Plus className="mr-1.5 h-4 w-4" />New semester</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{editing ? "Edit semester" : "New semester"}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <div>
                <Label>Academic year<RequiredMark /></Label>
                <Select value={form.academic_year_id} onValueChange={(v) => { setForm({ ...form, academic_year_id: v }); clearErr("academic_year_id"); }}>
                  <SelectTrigger className={cn(errors.academic_year_id && invalidInputClass)}><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <FieldError message={errors.academic_year_id} />
              </div>
              <div>
                <Label>Name<RequiredMark /></Label>
                <Input
                  value={form.name}
                  className={cn(errors.name && invalidInputClass)}
                  onChange={(e) => { setForm({ ...form, name: e.target.value }); clearErr("name"); }}
                  placeholder="1st Semester / 2nd Semester / Summer"
                />
                <FieldError message={errors.name} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Start date</Label>
                  <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div>
                  <Label>End date</Label>
                  <Input type="date" value={form.end_date} className={cn(errors.end_date && invalidInputClass)}
                    onChange={(e) => { setForm({ ...form, end_date: e.target.value }); clearErr("end_date"); }} />
                  <FieldError message={errors.end_date} />
                </div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Semester["status"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.is_current}
                  onChange={(e) => setForm({ ...form, is_current: e.target.checked })} />
                Mark as current semester (only one at a time)
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={submit} disabled={upsert.isPending}>{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Academic year</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Current</TableHead>
              <TableHead className="w-52 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : semesters.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No semesters yet.</TableCell></TableRow>
            ) : semesters.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="text-xs text-muted-foreground">{yearName(s.academic_year_id)}</TableCell>
                <TableCell className="font-medium">{s.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.start_date ?? "—"} → {s.end_date ?? "—"}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "default" : s.status === "closed" ? "destructive" : "outline"}>{s.status}</Badge>
                </TableCell>
                <TableCell>
                  {s.is_current ? <Badge className="bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/15"><CheckCircle2 className="mr-1 h-3 w-3" />Current</Badge> : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right space-x-1">
                  {!s.is_current && s.status !== "closed" && s.status !== "archived" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: s.id, is_current: true, status: "active" })}>
                      Set current
                    </Button>
                  )}
                  {s.status !== "closed" && s.status !== "archived" && (
                    <Button size="sm" variant="outline" onClick={() => setCloseTarget(s)}>
                      <XCircle className="mr-1 h-3.5 w-3.5" />Close
                    </Button>
                  )}
                  {s.status === "closed" && (
                    <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: s.id, status: "archived" })}>
                      <Archive className="mr-1 h-3.5 w-3.5" />Archive
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={!!closeTarget}
        onOpenChange={(v) => { if (!v) setCloseTarget(null); }}
        title="Close this semester?"
        description={<>Close <span className="font-medium">{closeTarget?.name}</span>? New attendance check-ins will be rejected. Historical data is preserved.</>}
        confirmLabel="Close semester"
        loading={setStatus.isPending}
        loadingLabel="Closing…"
        onConfirm={() => {
          if (closeTarget) {
            const t = closeTarget;
            setStatus.mutate({ id: t.id, status: "closed", is_current: false }, { onSettled: () => setCloseTarget(null) });
          }
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------- Enrollments
function EnrollmentsTab() {
  const qc = useQueryClient();
  const { data: years = [] } = useAcademicYears();
  const [yearFilter, setYearFilter] = useState("all");
  const { data: semesters = [] } = useSemesters(yearFilter === "all" ? undefined : yearFilter);
  const [semesterFilter, setSemesterFilter] = useState("all");
  const [sectionFilter, setSectionFilter] = useState("all");
  const [removeTarget, setRemoveTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: sections = [] } = useQuery({
    queryKey: ["sections-simple"],
    queryFn: async () => (await supabase.from("sections").select("id, name").order("name")).data ?? [],
  });

  const { data: enrollments = [], isLoading } = useQuery({
    queryKey: ["enrollments", yearFilter, semesterFilter, sectionFilter],
    queryFn: async () => {
      let q = supabase
        .from("student_enrollments" as never)
        .select(`
          id, student_id, section_id, academic_year_id, semester_id, status,
          students:students!student_enrollments_student_id_fkey(full_name, student_no),
          sections:sections!student_enrollments_section_id_fkey(name),
          semesters:semesters!student_enrollments_semester_id_fkey(name),
          academic_years:academic_years!student_enrollments_academic_year_id_fkey(name)
        `)
        .limit(500);
      if (yearFilter !== "all") q = (q as never as { eq: (c: string, v: string) => typeof q }).eq("academic_year_id", yearFilter);
      if (semesterFilter !== "all") q = (q as never as { eq: (c: string, v: string) => typeof q }).eq("semester_id", semesterFilter);
      if (sectionFilter !== "all") q = (q as never as { eq: (c: string, v: string) => typeof q }).eq("section_id", sectionFilter);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; status: string;
        students: { full_name: string; student_no: string } | null;
        sections: { name: string } | null;
        semesters: { name: string } | null;
        academic_years: { name: string } | null;
      }>;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("student_enrollments" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enrollments"] }); toast.success("Enrollment removed"); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setEnrStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("student_enrollments" as never).update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["enrollments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <div>
          <Label>Academic year</Label>
          <Select value={yearFilter} onValueChange={(v) => { setYearFilter(v); setSemesterFilter("all"); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All years</SelectItem>
              {years.map((y) => <SelectItem key={y.id} value={y.id}>{y.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Semester</Label>
          <Select value={semesterFilter} onValueChange={setSemesterFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All semesters</SelectItem>
              {semesters.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Section</Label>
          <Select value={sectionFilter} onValueChange={setSectionFilter}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sections</SelectItem>
              {(sections as { id: string; name: string }[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Section</TableHead>
              <TableHead>Semester</TableHead>
              <TableHead>Academic year</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : enrollments.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">No enrollments match the filters.</TableCell></TableRow>
            ) : enrollments.map((e) => (
              <TableRow key={e.id}>
                <TableCell>
                  <div className="font-medium">{e.students?.full_name ?? "—"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{e.students?.student_no ?? "—"}</div>
                </TableCell>
                <TableCell>{e.sections?.name ?? "—"}</TableCell>
                <TableCell>{e.semesters?.name ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.academic_years?.name ?? "—"}</TableCell>
                <TableCell>
                  <Select value={e.status} onValueChange={(v) => setEnrStatus.mutate({ id: e.id, status: v })}>
                    <SelectTrigger className="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">active</SelectItem>
                      <SelectItem value="completed">completed</SelectItem>
                      <SelectItem value="transferred">transferred</SelectItem>
                      <SelectItem value="inactive">inactive</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setRemoveTarget({ id: e.id, label: e.students?.full_name ?? "this enrollment" })}>Remove</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- Copy Students
function CopyStudentsTab() {
  const qc = useQueryClient();
  const { data: years = [] } = useAcademicYears();
  const { data: allSemesters = [] } = useSemesters();
  const { data: sections = [] } = useQuery({
    queryKey: ["sections-simple"],
    queryFn: async () => (await supabase.from("sections").select("id, name").order("name")).data ?? [],
  });

  const [srcSemester, setSrcSemester] = useState("");
  const [srcSection, setSrcSection] = useState("");
  const [tgtSemester, setTgtSemester] = useState("");
  const [tgtSection, setTgtSection] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [result, setResult] = useState<{ copied: number; skipped: number } | null>(null);

  const srcCount = useQuery({
    queryKey: ["copy-src-count", srcSemester, srcSection],
    enabled: !!srcSemester && !!srcSection,
    queryFn: async () => {
      const { count } = await supabase
        .from("student_enrollments" as never)
        .select("*", { count: "exact", head: true })
        .eq("semester_id", srcSemester)
        .eq("section_id", srcSection)
        .eq("status", "active");
      return count ?? 0;
    },
  });

  const doCopy = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        n: string, args: Record<string, string>,
      ) => Promise<{ data: unknown; error: { message: string } | null }>)(
        "copy_students_to_semester",
        {
          _source_semester_id: srcSemester,
          _source_section_id: srcSection,
          _target_semester_id: tgtSemester,
          _target_section_id: tgtSection,
        },
      );
      if (error) throw new Error(error.message);
      return data as { copied: number; skipped: number };
    },
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["enrollments"] });
      toast.success(`Copied ${r.copied} student(s); ${r.skipped} skipped`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const semesterLabel = (id: string) => {
    const s = allSemesters.find((x) => x.id === id);
    if (!s) return "";
    const y = years.find((x) => x.id === s.academic_year_id);
    return `${y?.name ?? ""} — ${s.name}`;
  };

  const startCopy = () => {
    const errs: Record<string, string> = {};
    if (!srcSemester) errs.srcSemester = "Source semester is required.";
    if (!srcSection) errs.srcSection = "Source section is required.";
    if (!tgtSemester) errs.tgtSemester = "Target semester is required.";
    if (!tgtSection) errs.tgtSection = "Target section is required.";
    if (srcSemester && tgtSemester && srcSemester === tgtSemester && srcSection === tgtSection) {
      errs.tgtSemester = "Source and target cannot be identical.";
    }
    setErrors(errs);
    if (Object.keys(errs).length === 0) setConfirmOpen(true);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Source</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div>
            <Label>Semester<RequiredMark /></Label>
            <Select value={srcSemester} onValueChange={(v) => { setSrcSemester(v); setErrors((e) => ({ ...e, srcSemester: "" })); }}>
              <SelectTrigger className={cn(errors.srcSemester && invalidInputClass)}><SelectValue placeholder="Choose source semester" /></SelectTrigger>
              <SelectContent>
                {allSemesters.map((s) => <SelectItem key={s.id} value={s.id}>{semesterLabel(s.id)}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError message={errors.srcSemester} />
          </div>
          <div>
            <Label>Section<RequiredMark /></Label>
            <Select value={srcSection} onValueChange={(v) => { setSrcSection(v); setErrors((e) => ({ ...e, srcSection: "" })); }}>
              <SelectTrigger className={cn(errors.srcSection && invalidInputClass)}><SelectValue placeholder="Choose source section" /></SelectTrigger>
              <SelectContent>
                {(sections as { id: string; name: string }[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError message={errors.srcSection} />
          </div>
          {srcSemester && srcSection && (
            <p className="text-xs text-muted-foreground">
              {srcCount.data ?? 0} active enrollment(s) will be considered for copy.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Target</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          <div>
            <Label>Semester<RequiredMark /></Label>
            <Select value={tgtSemester} onValueChange={(v) => { setTgtSemester(v); setErrors((e) => ({ ...e, tgtSemester: "" })); }}>
              <SelectTrigger className={cn(errors.tgtSemester && invalidInputClass)}><SelectValue placeholder="Choose target semester" /></SelectTrigger>
              <SelectContent>
                {allSemesters.map((s) => <SelectItem key={s.id} value={s.id}>{semesterLabel(s.id)}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError message={errors.tgtSemester} />
          </div>
          <div>
            <Label>Section<RequiredMark /></Label>
            <Select value={tgtSection} onValueChange={(v) => { setTgtSection(v); setErrors((e) => ({ ...e, tgtSection: "" })); }}>
              <SelectTrigger className={cn(errors.tgtSection && invalidInputClass)}><SelectValue placeholder="Choose target section" /></SelectTrigger>
              <SelectContent>
                {(sections as { id: string; name: string }[]).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <FieldError message={errors.tgtSection} />
          </div>
          <Button onClick={startCopy} disabled={doCopy.isPending}>
            <Copy className="mr-1.5 h-4 w-4" />Copy students
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="lg:col-span-2 border-emerald-500/40">
          <CardContent className="p-4 text-sm">
            <p className="font-semibold text-emerald-600">Copy complete.</p>
            <p className="text-muted-foreground">Copied: {result.copied} · Skipped (already existed): {result.skipped}</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirm copy</DialogTitle></DialogHeader>
          <div className="space-y-2 text-sm">
            <p>You're about to copy up to <strong>{srcCount.data ?? 0}</strong> active enrollment(s):</p>
            <p><span className="text-muted-foreground">From:</span> {semesterLabel(srcSemester)} · {useMemo(() => (sections as { id: string; name: string }[]).find((x) => x.id === srcSection)?.name ?? "", [sections, srcSection])}</p>
            <p><span className="text-muted-foreground">To:</span> {semesterLabel(tgtSemester)} · {useMemo(() => (sections as { id: string; name: string }[]).find((x) => x.id === tgtSection)?.name ?? "", [sections, tgtSection])}</p>
            <p className="text-xs text-muted-foreground">Students already enrolled in the target will be skipped. Historical data is preserved.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={() => { setConfirmOpen(false); doCopy.mutate(); }} disabled={doCopy.isPending}>Copy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
