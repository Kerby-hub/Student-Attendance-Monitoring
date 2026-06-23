import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, MapPin, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
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
  subjects?: { code: string; name: string } | null;
  teachers?: { full_name: string } | null;
  sections?: { name: string } | null;
  schedule_geofences?: { zone_id: string; geofence_zones: { name: string } | null }[];
};

const empty = {
  subject_id: "", teacher_id: "", section_id: "",
  room: "", day: "monday" as Day,
  start_time: "08:00", end_time: "09:00",
  semester: "1st", school_year: "2025-2026",
};

function SchedulesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [viewStudents, setViewStudents] = useState<Schedule | null>(null);
  const [form, setForm] = useState(empty);
  const [zoneIds, setZoneIds] = useState<string[]>([]);

  const { data = [], isLoading } = useQuery({
    queryKey: ["schedules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedules")
        .select("*, subjects(code,name), teachers(full_name), sections(name), schedule_geofences(zone_id, geofence_zones(name))")
        .order("school_year", { ascending: false })
        .order("day")
        .order("start_time");
      if (error) throw error;
      return data as unknown as Schedule[];
    },
  });

  const { data: subjects = [] } = useQuery({
    queryKey: ["subjects-for-schedule"],
    queryFn: async () => (await supabase.from("subjects").select("id, code, name").eq("archived", false).order("code")).data ?? [],
  });
  const { data: teachers = [] } = useQuery({
    queryKey: ["teachers-for-schedule"],
    queryFn: async () => (await supabase.from("teachers").select("id, full_name").eq("status", "active").order("full_name")).data ?? [],
  });
  const { data: sections = [] } = useQuery({
    queryKey: ["sections-for-schedule"],
    queryFn: async () => (await supabase.from("sections").select("id, name, school_year").order("name")).data ?? [],
  });
  const { data: zones = [] } = useQuery({
    queryKey: ["zones-for-schedule"],
    queryFn: async () => (await supabase.from("geofence_zones").select("id, name, radius_meters").eq("active", true).order("name")).data ?? [],
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = { ...form, room: form.room || null };
      let scheduleId: string;
      if (editing) {
        const { error } = await supabase.from("class_schedules").update(payload).eq("id", editing.id);
        if (error) throw error;
        scheduleId = editing.id;
      } else {
        const { data: created, error } = await supabase.from("class_schedules").insert(payload).select("id").single();
        if (error) throw error;
        scheduleId = created.id;
      }
      // Sync geofence links
      const { error: delErr } = await supabase.from("schedule_geofences").delete().eq("schedule_id", scheduleId);
      if (delErr) throw delErr;
      if (zoneIds.length > 0) {
        const { error: insErr } = await supabase.from("schedule_geofences")
          .insert(zoneIds.map((zid) => ({ schedule_id: scheduleId, zone_id: zid })));
        if (insErr) throw insErr;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Schedule updated" : "Schedule created");
      qc.invalidateQueries({ queryKey: ["schedules"] });
      setOpen(false); setEditing(null); setForm(empty); setZoneIds([]);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("class_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["schedules"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => { setEditing(null); setForm(empty); setZoneIds([]); setOpen(true); };
  const openEdit = (s: Schedule) => {
    setEditing(s);
    setForm({
      subject_id: s.subject_id, teacher_id: s.teacher_id, section_id: s.section_id,
      room: s.room ?? "", day: s.day,
      start_time: s.start_time.slice(0,5), end_time: s.end_time.slice(0,5),
      semester: s.semester, school_year: s.school_year,
    });
    setZoneIds(s.schedule_geofences?.map((g) => g.zone_id) ?? []);
    setOpen(true);
  };

  useEffect(() => { if (!open) { setZoneIds([]); } }, [open]);

  const toggleZone = (id: string) => {
    setZoneIds((prev) => prev.includes(id) ? prev.filter((z) => z !== id) : [...prev, id]);
  };

  return (
    <div>
      <PageHeader
        title="Class Schedules"
        description="Assign teachers, subjects, sections, and geofence zones to time slots."
        action={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button onClick={openCreate}><Plus className="mr-1.5 h-4 w-4" />New schedule</Button></DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader><DialogTitle>{editing ? "Edit schedule" : "New schedule"}</DialogTitle></DialogHeader>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Subject</Label>
                  <Select value={form.subject_id} onValueChange={(v) => setForm({ ...form, subject_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select subject" /></SelectTrigger>
                    <SelectContent>{subjects.map((s) => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Teacher</Label>
                  <Select value={form.teacher_id} onValueChange={(v) => setForm({ ...form, teacher_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                    <SelectContent>{teachers.map((t) => <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Section</Label>
                  <Select value={form.section_id} onValueChange={(v) => setForm({ ...form, section_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                    <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.school_year})</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Room</Label><Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="Rm 101" /></div>
                <div>
                  <Label>Day</Label>
                  <Select value={form.day} onValueChange={(v) => setForm({ ...form, day: v as Day })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{DAYS.map((d) => <SelectItem key={d} value={d} className="capitalize">{d}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Start</Label><Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} /></div>
                <div><Label>End</Label><Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} /></div>
                <div><Label>Semester</Label><Input value={form.semester} onChange={(e) => setForm({ ...form, semester: e.target.value })} placeholder="1st" /></div>
                <div><Label>School year</Label><Input value={form.school_year} onChange={(e) => setForm({ ...form, school_year: e.target.value })} placeholder="2025-2026" /></div>

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
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button
                  onClick={() => upsert.mutate()}
                  disabled={!form.subject_id || !form.teacher_id || !form.section_id || upsert.isPending}
                >{editing ? "Save" : "Create"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />
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
            ) : data.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="py-8 text-center text-muted-foreground">No schedules yet.</TableCell></TableRow>
            ) : data.map((s) => (
              <TableRow key={s.id}>
                <TableCell className="capitalize">{s.day}</TableCell>
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
                      {s.schedule_geofences.slice(0, 2).map((g) => (
                        <Badge key={g.zone_id} variant="outline" className="text-xs">
                          <MapPin className="mr-1 h-3 w-3" />{g.geofence_zones?.name ?? "—"}
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
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm("Delete this schedule?")) remove.mutate(s.id); }}><Trash2 className="h-4 w-4" /></Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ScheduleStudentsDialog schedule={viewStudents} onClose={() => setViewStudents(null)} />
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
