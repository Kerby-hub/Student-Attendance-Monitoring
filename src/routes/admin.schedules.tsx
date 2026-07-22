import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, MapPin, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
import { RequiredMark, FieldError, invalidInputClass } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";
import { useAcademicYears, useCurrentSemester } from "@/lib/academic/hooks";


export const Route = createFileRoute("/admin/schedules")({
  component: SchedulesPage,
});

const DAYS = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"] as const;
type Day = (typeof DAYS)[number];

type Schedule = {
  id: string;
  subject_id: string; teacher_id: string; section_id: string;
  room: string | null;
  day: Day;
  start_time: string; end_time: string;
  semester: string; school_year: string;
  academic_year_id: string | null;
  semester_id: string | null;
  subjects?: { code: string; name: string; department_id: string | null } | null;
  teachers?: { full_name: string } | null;
  sections?: { name: string; program: string | null; department_id?: string | null } | null;
  schedule_geofences?: { zone_id: string; geofence_zones: { name: string } | null }[];
};

const empty = {
  subject_id: "", teacher_id: "", section_id: "",
  room: "", day: "monday" as Day,
  days: ["monday"] as Day[],
  start_time: "08:00", end_time: "09:00",
  semester: "1st", school_year: "2025-2026",
  academic_year_id: "" as string,
  semester_id: "" as string,
  // Cascade helpers (not persisted): Department → Program → Year → Section → Subject
  form_department_id: "" as string,
  form_program: "" as string,
  form_year_level: "" as string,
};

function SchedulesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  // When editing a grouped multi-day schedule we track the IDs of every row in
  // the group so we can reconcile them on save/delete.
  const [editingGroupIds, setEditingGroupIds] = useState<string[]>([]);
  const [viewStudents, setViewStudents] = useState<Schedule | null>(null);
  const [toDelete, setToDelete] = useState<{ label: string; ids: string[] } | null>(null);
  const [form, setForm] = useState(empty);
  const [zoneIds, setZoneIds] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const [search, setSearch] = useState("");
  const [fSection, setFSection] = useState<string>("all");
  const [fSubject, setFSubject] = useState<string>("all");
  const [fTeacher, setFTeacher] = useState<string>("all");
  const [fDept, setFDept] = useState<string>("all");
  const [fProgram, setFProgram] = useState<string>("all");

  const { data: years = [] } = useAcademicYears();
  const { data: currentSemester } = useCurrentSemester();


  const { data = [], isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedules")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("*, subjects(code,name,department_id), teachers(full_name), sections(name,program,department_id), schedule_geofences(zone_id, geofence_zones(name))" as any)
        .order("school_year", { ascending: false })
        .order("day")
        .order("start_time");
      if (error) throw error;
      return data as unknown as Schedule[];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-for-schedule"],
    queryFn: async () => (await supabase.from("subjects").select("id, code, name, department_id").eq("archived", false).order("code")).data ?? [],
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-for-schedule"],
    queryFn: async () => (await supabase.from("teachers").select("id, full_name, department_id").eq("status", "active").order("full_name")).data ?? [],
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections-for-schedule"],
    queryFn: async () => {
      const { data } = await supabase.from("sections")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .select("id, name, school_year, program, year_level, department_id" as any).order("name");
      return (data ?? []) as unknown as { id: string; name: string; school_year: string; program: string | null; year_level: number | null; department_id: string | null }[];
    },
  });
  const { data: zones = [] } = useQuery({
    queryKey: ["zones-for-schedule"],
    queryFn: async () => (await supabase.from("geofence_zones").select("id, name, radius_meters").eq("active", true).order("name")).data ?? [],
  });
  const { data: depts = [] } = useQuery({
    queryKey: ["departments-for-schedule"],
    queryFn: async () => (await supabase.from("departments").select("id, name").order("name")).data ?? [],
  });
  // Dependent options — Department → Program → Section → Subject
  const programOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of sections) {
      if (fDept !== "all" && s.department_id !== fDept) continue;
      if (s.program?.trim()) set.add(s.program.trim());
    }
    return Array.from(set).sort();
  }, [sections, fDept]);

  const sectionOptions = useMemo(() => {
    return sections.filter((s) => {
      if (fDept !== "all" && s.department_id !== fDept) return false;
      if (fProgram !== "all" && (s.program ?? "") !== fProgram) return false;
      return true;
    });
  }, [sections, fDept, fProgram]);

  const subjectOptions = useMemo(() => {
    return subjects.filter((sub: { id: string; code: string; name: string; department_id?: string | null }) => {
      if (fDept !== "all" && (sub.department_id ?? null) !== fDept) return false;
      return true;
    });
  }, [subjects, fDept]);

  // Group schedule rows that share the same class + time + term + room so a
  // multi-day schedule shows as one row with all its days.
  const DAY_ORDER: Record<string, number> = {
    monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6, sunday: 7,
  };
  const groups = useMemo(() => {
    const map = new Map<string, { key: string; rows: Schedule[] }>();
    for (const s of data) {
      const key = [
        s.subject_id, s.teacher_id, s.section_id, s.start_time, s.end_time,
        s.room ?? "", s.academic_year_id ?? "", s.semester_id ?? "",
        s.semester, s.school_year,
      ].join("|");
      const bucket = map.get(key) ?? { key, rows: [] };
      bucket.rows.push(s);
      map.set(key, bucket);
    }
    return Array.from(map.values()).map((g) => {
      const rows = [...g.rows].sort((a, b) => (DAY_ORDER[a.day] ?? 99) - (DAY_ORDER[b.day] ?? 99));
      return { key: g.key, rows, days: rows.map((r) => r.day), first: rows[0] };
    });
  }, [data]);

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return groups.filter((g) => {
      const s = g.first;
      if (fSection !== "all" && s.section_id !== fSection) return false;
      if (fSubject !== "all" && s.subject_id !== fSubject) return false;
      if (fTeacher !== "all" && s.teacher_id !== fTeacher) return false;
      if (fDept !== "all") {
        const subjDept = s.subjects?.department_id ?? null;
        const secDept = s.sections?.department_id ?? null;
        if (subjDept !== fDept && secDept !== fDept) return false;
      }
      if (fProgram !== "all" && (s.sections?.program ?? "") !== fProgram) return false;
      if (!q) return true;
      const hay = [
        s.subjects?.code, s.subjects?.name, s.teachers?.full_name,
        s.sections?.name, s.sections?.program, s.room, s.start_time, s.end_time,
        g.days.join(","),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [groups, search, fSection, fSubject, fTeacher, fDept, fProgram]);
  const resetFilters = () => {
    setSearch(""); setFSection("all"); setFSubject("all"); setFTeacher("all");
    setFDept("all"); setFProgram("all");
  };

  const upsert = useMutation({
    mutationFn: async () => {
      if (!currentSemester && !editing) {
        throw new Error("Please set an active Academic Year and Semester first.");
      }
      const days = form.days.length > 0 ? form.days : [form.day];
      // Strip cascade helpers — they are UI-only and not columns on class_schedules.
      const { days: _drop, form_department_id: _d, form_program: _p, form_year_level: _y, ...base } = form;
      const payloadBase = { ...base, room: form.room || null };
      const affectedIds: string[] = [];

      if (editing && editingGroupIds.length > 0) {
        // Reconcile: keep the group's existing rows whose day is in the new
        // selection (update their fields), delete rows whose day is dropped,
        // and insert new rows for freshly-checked days.
        const existing = data.filter((s) => editingGroupIds.includes(s.id));
        const keepByDay = new Map<string, Schedule>();
        const toDropIds: string[] = [];
        for (const row of existing) {
          if (days.includes(row.day)) keepByDay.set(row.day, row);
          else toDropIds.push(row.id);
        }
        for (const [day, row] of keepByDay) {
          const { error } = await supabase.from("class_schedules")
            .update({ ...payloadBase, day: day as Day })
            .eq("id", row.id);
          if (error) throw error;
          affectedIds.push(row.id);
        }
        for (const d of days) {
          if (keepByDay.has(d)) continue;
          const { data: created, error } = await supabase.from("class_schedules")
            .insert({ ...payloadBase, day: d }).select("id").single();
          if (error) throw error;
          affectedIds.push(created.id);
        }
        if (toDropIds.length > 0) {
          const { error } = await supabase.from("class_schedules").delete().in("id", toDropIds);
          if (error) throw error;
        }
      } else {
        for (const d of days) {
          const { data: created, error } = await supabase
            .from("class_schedules")
            .insert({ ...payloadBase, day: d })
            .select("id").single();
          if (error) throw error;
          affectedIds.push(created.id);
        }
      }

      // Sync geofence links for every affected schedule row.
      for (const sid of affectedIds) {
        const { error: delErr } = await supabase.from("schedule_geofences").delete().eq("schedule_id", sid);
        if (delErr) throw delErr;
        if (zoneIds.length > 0) {
          const { error: insErr } = await supabase.from("schedule_geofences")
            .insert(zoneIds.map((zid) => ({ schedule_id: sid, zone_id: zid })));
          if (insErr) throw insErr;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Schedule updated" : "Schedule created");
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setOpen(false); setEditing(null); setEditingGroupIds([]); setForm(empty); setZoneIds([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("class_schedules").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["schedules"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditing(null); setEditingGroupIds([]);
    const currentYear = years.find((y) => y.id === currentSemester?.academic_year_id);
    setForm({
      ...empty,
      academic_year_id: currentSemester?.academic_year_id ?? "",
      semester_id: currentSemester?.id ?? "",
      semester: currentSemester?.name ?? empty.semester,
      school_year: currentYear?.name ?? empty.school_year,
    });
    setZoneIds([]); setErrors({}); setOpen(true);
  };
  const openEditGroup = (rows: Schedule[]) => {
    const s = rows[0];
    setEditing(s);
    setEditingGroupIds(rows.map((r) => r.id));
    const sec = sections.find((x) => x.id === s.section_id);
    setForm({
      subject_id: s.subject_id, teacher_id: s.teacher_id, section_id: s.section_id,
      room: s.room ?? "", day: s.day,
      days: rows.map((r) => r.day),
      start_time: s.start_time.slice(0,5), end_time: s.end_time.slice(0,5),
      semester: s.semester, school_year: s.school_year,
      academic_year_id: s.academic_year_id ?? "",
      semester_id: s.semester_id ?? "",
      form_department_id: sec?.department_id ?? s.subjects?.department_id ?? "",
      form_program: sec?.program ?? "",
      form_year_level: sec?.year_level != null ? String(sec.year_level) : "",
    });
    // Zones are stored per row; take the union across the group so the edit
    // form reflects everything the group currently has assigned.
    const zoneSet = new Set<string>();
    for (const r of rows) r.schedule_geofences?.forEach((g) => zoneSet.add(g.zone_id));
    setZoneIds(Array.from(zoneSet));
    setErrors({}); setOpen(true);
  };

  useEffect(() => { if (!open) { setZoneIds([]); } }, [open]);

  const toggleZone = (id: string) => {
    setZoneIds((prev) => prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]);
  };
  const toggleDay = (d: Day) => {
    setForm((f) => ({
      ...f,
      days: f.days.includes(d) ? f.days.filter((x) => x !== d) : [...f.days, d],
    }));
    clearErr("days");
  };

  return (
    <div>
      <PageHeader
        title="Class Schedules"
        description="Assign teachers, subjects, sections, and geofence zones to time slots."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New schedule</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
              <DialogHeader className="border-b px-6 py-4"><DialogTitle>{editing ? "Edit schedule" : "New schedule"}</DialogTitle></DialogHeader>
              <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Cascade filters: Department → Program → Year → Section → Subject */}
                {(() => {
                  const formProgramOpts = Array.from(new Set(
                    sections
                      .filter((s) => !form.form_department_id || s.department_id === form.form_department_id)
                      .map((s) => s.program).filter((p): p is string => !!p),
                  )).sort();
                  const formYearOpts = Array.from(new Set(
                    sections
                      .filter((s) => !form.form_department_id || s.department_id === form.form_department_id)
                      .filter((s) => !form.form_program || s.program === form.form_program)
                      .map((s) => s.year_level).filter((y): y is number => y != null),
                  )).sort((a, b) => a - b);
                  const formSectionOpts = sections.filter((s) => {
                    if (form.form_department_id && s.department_id !== form.form_department_id) return false;
                    if (form.form_program && s.program !== form.form_program) return false;
                    if (form.form_year_level && String(s.year_level ?? "") !== form.form_year_level) return false;
                    return true;
                  });
                  // Subjects: filter by department; further narrow by whether the subject has
                  // ever been scheduled in a matching section when program/year/section chosen.
                  const scheduledSubjectIds = new Set<string>();
                  for (const row of data) {
                    const sec = row.sections;
                    if (form.form_program && (sec?.program ?? "") !== form.form_program) continue;
                    if (form.form_year_level) {
                      const secFull = sections.find((x) => x.id === row.section_id);
                      if (String(secFull?.year_level ?? "") !== form.form_year_level) continue;
                    }
                    if (form.section_id && row.section_id !== form.section_id) continue;
                    scheduledSubjectIds.add(row.subject_id);
                  }
                  const narrowBySchedule = !!(form.form_program || form.form_year_level || form.section_id);
                  const formSubjectOpts = subjects.filter((sub: { id: string; code: string; name: string; department_id?: string | null }) => {
                    if (form.form_department_id && (sub.department_id ?? null) !== form.form_department_id) return false;
                    if (narrowBySchedule && scheduledSubjectIds.size > 0 && !scheduledSubjectIds.has(sub.id)) return false;
                    return true;
                  });
                  return (
                    <>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label>Department</Label>
                          {form.form_department_id && (
                            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm({ ...form, form_department_id: "", form_program: "", form_year_level: "", section_id: "", subject_id: "" })}>Clear</button>
                          )}
                        </div>
                        <Select
                          value={form.form_department_id || undefined}
                          onValueChange={(v) => setForm({ ...form, form_department_id: v, form_program: "", form_year_level: "", section_id: "", subject_id: "" })}
                        >
                          <SelectTrigger><SelectValue placeholder={depts.length === 0 ? "No records added." : "Select Department"} /></SelectTrigger>
                          <SelectContent>
                            {depts.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
                            ) : depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label>Program/Course</Label>
                          {form.form_program && (
                            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm({ ...form, form_program: "", form_year_level: "", section_id: "", subject_id: "" })}>Clear</button>
                          )}
                        </div>
                        <Select
                          value={form.form_program || undefined}
                          onValueChange={(v) => setForm({ ...form, form_program: v, form_year_level: "", section_id: "", subject_id: "" })}
                        >
                          <SelectTrigger><SelectValue placeholder={formProgramOpts.length === 0 ? "No records added." : "Select Program/Course"} /></SelectTrigger>
                          <SelectContent>
                            {formProgramOpts.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
                            ) : formProgramOpts.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <Label>Year Level</Label>
                          {form.form_year_level && (
                            <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setForm({ ...form, form_year_level: "", section_id: "", subject_id: "" })}>Clear</button>
                          )}
                        </div>
                        <Select
                          value={form.form_year_level || undefined}
                          onValueChange={(v) => setForm({ ...form, form_year_level: v, section_id: "", subject_id: "" })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select Year Level" /></SelectTrigger>
                          <SelectContent>
                            {[1,2,3,4,5].map((y) => <SelectItem key={y} value={String(y)}>{y === 1 ? "1st Year" : y === 2 ? "2nd Year" : y === 3 ? "3rd Year" : y === 4 ? "4th Year" : "5th Year"}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Section<RequiredMark /></Label>
                        <Select value={form.section_id || undefined} onValueChange={(v) => { setForm({ ...form, section_id: v, subject_id: "" }); clearErr("section_id"); }}>
                          <SelectTrigger className={cn(errors.section_id && invalidInputClass)}><SelectValue placeholder={formSectionOpts.length === 0 ? "No records added." : "Select Section"} /></SelectTrigger>
                          <SelectContent>
                            {formSectionOpts.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
                            ) : formSectionOpts.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.school_year})</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FieldError message={errors.section_id} />
                      </div>
                      <div className="sm:col-span-2">
                        <Label>Subject<RequiredMark /></Label>
                        <Select value={form.subject_id || undefined} onValueChange={(v) => { setForm({ ...form, subject_id: v }); clearErr("subject_id"); }}>
                          <SelectTrigger className={cn(errors.subject_id && invalidInputClass)}><SelectValue placeholder={formSubjectOpts.length === 0 ? "No records added." : "Select Subject"} /></SelectTrigger>
                          <SelectContent>
                            {formSubjectOpts.length === 0 ? (
                              <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
                            ) : formSubjectOpts.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <FieldError message={errors.subject_id} />
                      </div>
                    </>
                  );
                })()}
                <div>
                  <Label>Teacher<RequiredMark /></Label>
                  <Select value={form.teacher_id || undefined} onValueChange={(v) => { setForm({ ...form, teacher_id: v }); clearErr("teacher_id"); }}>
                    <SelectTrigger className={cn(errors.teacher_id && invalidInputClass)}><SelectValue placeholder={teachers.length === 0 ? "No records added." : "Select Teacher"} /></SelectTrigger>
                    <SelectContent>
                      {teachers.length === 0 ? (
                        <div className="px-2 py-1.5 text-xs text-muted-foreground">No records added.</div>
                      ) : teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <FieldError message={errors.teacher_id} />
                </div>
                <div><Label>Room</Label><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Rm 101" /></div>
                <div className="sm:col-span-2">
                  <Label>Days<RequiredMark /></Label>
                  <div
                    className={cn(
                      "mt-1 flex flex-wrap gap-2 rounded-md border p-2",
                      errors.days && "border-destructive",
                    )}
                    role="group"
                    aria-label="Days of the week"
                  >
                    {DAYS.map((d) => {
                      const on = form.days.includes(d);
                      return (
                        <label
                          key={d}
                          className={cn(
                            "flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm capitalize transition",
                            on ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted",
                          )}
                        >
                          <Checkbox checked={on} onCheckedChange={() => toggleDay(d)} />
                          {d}
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selecting multiple days creates a schedule row per day. Editing updates the current row and adds rows for any extra days.
                  </p>
                  <FieldError message={errors.days} />
                </div>
                <div><Label>Start<RequiredMark /></Label><Input type="time" value={form.start_time} className={cn(errors.start_time && invalidInputClass)} onChange={(e) => { setForm({ ...form, start_time: e.target.value }); clearErr("start_time"); clearErr("end_time"); }} /><FieldError message={errors.start_time} /></div>
                <div><Label>End<RequiredMark /></Label><Input type="time" value={form.end_time} className={cn(errors.end_time && invalidInputClass)} onChange={(e) => { setForm({ ...form, end_time: e.target.value }); clearErr("end_time"); }} /><FieldError message={errors.end_time} /></div>
                <div className="sm:col-span-2">
                  <Label>Academic year &amp; semester</Label>
                  {currentSemester ? (
                    <div className="mt-1 rounded-md border bg-muted/30 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="uppercase">Active</Badge>
                        <span className="font-medium">
                          {years.find((y) => y.id === currentSemester.academic_year_id)?.name ?? form.school_year}
                        </span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-medium">{currentSemester.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Schedules are saved under the currently active academic year and semester. Change the active period from <strong>Academic Management</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="mt-1 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                      Please set an active Academic Year and Semester first.
                    </div>
                  )}
                  {errors.semester_id ? <FieldError message={errors.semester_id} /> : null}
                </div>

                <div className="sm:col-span-2">
                  <Label className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" /> Allowed geofence zones</Label>
                  <p className="mb-2 text-xs text-muted-foreground">
                    Students may only check in when located inside one of the selected zones. Leave empty to disable geofence enforcement for this class.
                  </p>
                  {zones.length === 0 ? (
                    <p className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                      No active geofence zones yet. Create one in <strong>Geofencing</strong> first.
                    </p>
                  ) : (
                    <div className="max-h-40 space-y-1 overflow-y-auto rounded-md border p-2">
                      {zones.map((z) => (
                        <label key={z.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                          <Checkbox checked={zoneIds.includes(z.id)} onCheckedChange={() => toggleZone(z.id)} />
                          <span className="flex-1">{z.name}</span>
                          <span className="text-xs text-muted-foreground">{z.radius_meters}m</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </div>
              <DialogFooter className="border-t bg-background px-6 py-3">
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => {
                    if (upsert.isPending) return;
                    const errs: Record<string, string> = {};
                    if (!form.subject_id) errs.subject_id = "Subject is required.";
                    if (!form.teacher_id) errs.teacher_id = "Teacher is required.";
                    if (!form.section_id) errs.section_id = "Section is required.";
                    if (!form.start_time) errs.start_time = "Start time is required.";
                    if (!form.end_time) errs.end_time = "End time is required.";
                    if (form.start_time && form.end_time && form.end_time <= form.start_time) errs.end_time = "End time must be after start time.";
                    if (!form.semester.trim()) errs.semester = "Semester is required.";
                    if (!form.school_year.trim()) errs.school_year = "School year is required.";
                    if (!form.academic_year_id) errs.academic_year_id = "Academic year is required.";
                    if (!form.semester_id) errs.semester_id = "Semester is required.";
                    if (!form.days || form.days.length === 0) errs.days = "Please select at least one day.";
                    setErrors(errs);
                    if (Object.keys(errs).length === 0) upsert.mutate();
                  }}
                  disabled={upsert.isPending}
                >{upsert.isPending ? "Saving…" : editing ? "Save" : "Create"}</Button>
              </DialogFooter>

            </DialogContent>
          </Dialog>
        }
      />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Input
          placeholder="Search schedules..."
          className="max-w-xs"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={fDept} onValueChange={(v) => { setFDept(v); setFProgram("all"); setFSection("all"); setFSubject("all"); }}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All Departments" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            {depts.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fProgram} onValueChange={(v) => { setFProgram(v); setFSection("all"); }}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All Programs/Courses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Programs/Courses</SelectItem>
            {programOptions.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fSection} onValueChange={setFSection}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="All Sections" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sections</SelectItem>
            {sectionOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fSubject} onValueChange={setFSubject}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All Subjects" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {subjectOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={fTeacher} onValueChange={setFTeacher}>
          <SelectTrigger className="w-full sm:w-56"><SelectValue placeholder="All Teachers" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Teachers</SelectItem>
            {teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}
          </SelectContent>
        </Select>
        {(search || fSection !== "all" || fSubject !== "all" || fTeacher !== "all" || fDept !== "all" || fProgram !== "all") && (
          <Button variant="ghost" size="sm" onClick={resetFilters}><X className="mr-1 h-4 w-4" />Reset filters</Button>
        )}
      </div>
      <div className="rounded-lg border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Day</TableHead><TableHead>Time</TableHead>
              <TableHead>Subject</TableHead><TableHead>Teacher</TableHead>
              <TableHead>Section</TableHead><TableHead>Room</TableHead>
              <TableHead>Geofence</TableHead>
              <TableHead>Term</TableHead><TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">Loading…</TableCell></TableRow>
            ) : filteredGroups.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                {data.length === 0 ? "No schedules yet." : "No schedules match your search or filters."}
              </TableCell></TableRow>
            ) : filteredGroups.map((g) => {
              const s = g.first;
              const label = `${s.subjects?.code ?? ""} · ${s.sections?.name ?? ""}`;
              return (
              <TableRow key={g.key}>
                <TableCell className="capitalize">
                  {g.days.length > 1
                    ? g.days.map((d) => d[0].toUpperCase() + d.slice(1)).join(", ")
                    : g.days[0]}
                </TableCell>
                <TableCell className="font-mono text-xs">{s.start_time.slice(0,5)}–{s.end_time.slice(0,5)}</TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{s.subjects?.code}</div>
                  <div className="text-sm">{s.subjects?.name}</div>
                </TableCell>
                <TableCell>{s.teachers?.full_name}</TableCell>
                <TableCell>{s.sections?.name}</TableCell>
                <TableCell>{s.room ?? "—"}</TableCell>
                <TableCell>
                  {s.schedule_geofences && s.schedule_geofences.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {s.schedule_geofences.slice(0, 2).map((z) => (
                        <Badge key={z.zone_id} variant="outline" className="text-xs">
                          <MapPin className="mr-1 h-3 w-3" />{z.geofence_zones?.name ?? "—"}
                        </Badge>
                      ))}
                      {s.schedule_geofences.length > 2 && <Badge variant="outline" className="text-xs">+{s.schedule_geofences.length - 2}</Badge>}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{s.semester} · {s.school_year}</TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" title="View students" onClick={() => setViewStudents(s)}><Users className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => openEditGroup(g.rows)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setToDelete({ label, ids: g.rows.map((r) => r.id) })}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ScheduleStudentsDialog schedule={viewStudents} onClose={() => setViewStudents(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(v) => { if (!v) setToDelete(null); }}
        title="Delete this schedule?"
        description={<>Are you sure you want to delete <span className="font-medium">{toDelete?.label}</span>? {toDelete && toDelete.ids.length > 1 ? `All ${toDelete.ids.length} day rows for this schedule will be removed. ` : ""}Historical attendance sessions will remain, but this schedule cannot be recovered.</>}
        confirmLabel="Delete"
        loading={remove.isPending}
        loadingLabel="Deleting…"
        onConfirm={() => { if (toDelete) remove.mutate(toDelete.ids, { onSettled: () => setToDelete(null) }); }}
      />
    </div>
  );
}

function ScheduleStudentsDialog({ schedule, onClose }: { schedule: Schedule | null; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["schedule-students", schedule?.section_id],
    enabled: !!schedule?.section_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, student_no, full_name, email, status")
        .eq("section_id", schedule!.section_id)
        .eq("status", "active")
        .order("full_name");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <Dialog open={!!schedule} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Students — {schedule?.subjects?.code} · {schedule?.sections?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">Loading…</TableCell></TableRow>
              ) : data.length === 0 ? (
                <TableRow><TableCell colSpan={4} className="py-6 text-center text-muted-foreground">No active students in this section.</TableCell></TableRow>
              ) : data.map((st: any) => (
                <TableRow key={st.id}>
                  <TableCell className="font-mono text-xs">{st.student_no}</TableCell>
                  <TableCell>{st.full_name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{st.email}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize">{st.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Close</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
