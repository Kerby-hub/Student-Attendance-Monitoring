import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, MapPin } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { RequiredMark, FieldError, invalidInputClass } from "@/components/ui/form-field";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/calendar")({
  component: AdminCalendarPage,
});

type Audience = "all" | "teachers" | "students";
type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  audience: Audience;
  event_type: string | null;
  location: string | null;
};

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const EVENT_TYPES = ["General", "Holiday", "Exam", "Meeting", "Activity", "Deadline"];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(d.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return ymd(a) === ymd(b); }

function combineDateTime(date: string, time: string) {
  // local datetime -> ISO
  return new Date(`${date}T${time}`).toISOString();
}

function AdminCalendarPage() {
  const { user, hasRole } = useAuth();
  const qc = useQueryClient();
  const canEdit = hasRole("admin");

  const [cursor, setCursor] = useState(new Date());
  const [editing, setEditing] = useState<EventRow | null>(null);
  const [creating, setCreating] = useState<{ date?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<EventRow | null>(null);
  const [viewing, setViewing] = useState<EventRow | null>(null);
  const [dayDetail, setDayDetail] = useState<string | null>(null);

  const monthFrom = startOfMonth(cursor);
  const monthTo = new Date(endOfMonth(cursor).getTime() + 86400000);

  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["admin-calendar", cursor.getFullYear(), cursor.getMonth()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, description, starts_at, ends_at, audience, event_type, location")
        .gte("starts_at", monthFrom.toISOString())
        .lt("starts_at", monthTo.toISOString())
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const byDay = useMemo(() => {
    const m = new Map<string, EventRow[]>();
    events.forEach((e) => {
      const k = ymd(new Date(e.starts_at));
      const arr = m.get(k) ?? [];
      arr.push(e); m.set(k, arr);
    });
    return m;
  }, [events]);

  const upsert = useMutation({
    mutationFn: async (input: Partial<EventRow> & { id?: string }) => {
      if (input.id) {
        const { error } = await supabase.from("calendar_events").update({
          title: input.title!, description: input.description ?? null,
          starts_at: input.starts_at!, ends_at: input.ends_at!,
          audience: input.audience!, event_type: input.event_type ?? null,
          location: input.location ?? null,
        }).eq("id", input.id);
        if (error) throw error;
      } else {
        // Server-side duplicate guard: skip insert if an identical event
        // already exists (same title/time/audience by the same creator).
        const { data: dup } = await supabase
          .from("calendar_events")
          .select("id")
          .eq("title", input.title!)
          .eq("starts_at", input.starts_at!)
          .eq("ends_at", input.ends_at!)
          .eq("audience", input.audience!)
          .eq("created_by", user?.id ?? "")
          .limit(1)
          .maybeSingle();
        if (dup?.id) return;
        const { error } = await supabase.from("calendar_events").insert({
          title: input.title!, description: input.description ?? null,
          starts_at: input.starts_at!, ends_at: input.ends_at!,
          audience: input.audience!, event_type: input.event_type ?? null,
          location: input.location ?? null, created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Event saved");
      setEditing(null); setCreating(null);
      qc.invalidateQueries({ queryKey: ["admin-calendar"] });
      qc.invalidateQueries({ queryKey: ["cal-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("calendar_events").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Event deleted");
      setConfirmDelete(null); setViewing(null);
      qc.invalidateQueries({ queryKey: ["admin-calendar"] });
      qc.invalidateQueries({ queryKey: ["cal-events"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = (delta: number) => {
    const c = new Date(cursor); c.setMonth(c.getMonth() + delta); setCursor(c);
  };

  // Build month grid
  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const startGrid = addDays(first, -first.getDay());
  const cells: Date[] = []; for (let i = 0; i < 42; i++) cells.push(addDays(startGrid, i));
  const today = new Date();

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="Manage school events, exams, holidays, and announcements."
        action={canEdit ? (
          <Button onClick={() => setCreating({ date: ymd(today) })}>
            <Plus className="mr-1.5 h-4 w-4" />New event
          </Button>
        ) : null}
      />

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</CardTitle>
            <Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {isLoading ? "Loading…" : `${events.length} events this month`}
          </p>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="rounded border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {(error as Error).message}
            </p>
          ) : null}

          <div className="mb-2 grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
            {cells.map((d) => {
              const k = ymd(d);
              const dayEvents = byDay.get(k) ?? [];
              const inMonth = d.getMonth() === cursor.getMonth() && d <= last;
              return (
                <div
                  key={k}
                  className={cn(
                    "min-h-[110px] bg-card p-1.5 text-xs",
                    !inMonth && "bg-muted/40 text-muted-foreground",
                    sameDay(d, today) && "ring-2 ring-primary ring-inset",
                  )}
                >
                  <div className="mb-1 flex items-center justify-between">
                    <span className={cn("font-medium", sameDay(d, today) && "text-primary")}>{d.getDate()}</span>
                    {canEdit && inMonth && (
                      <button
                        onClick={() => setCreating({ date: k })}
                        className="opacity-0 transition group-hover:opacity-100 hover:text-primary"
                        aria-label="Add event"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => setViewing(ev)}
                        className="block w-full truncate rounded bg-primary/15 px-1.5 py-0.5 text-left text-[11px] font-medium text-primary hover:bg-primary/25"
                        title={ev.title}
                      >
                        {ev.title}
                      </button>
                    ))}
                    {dayEvents.length > 3 && (
                      <button
                        onClick={() => setDayDetail(k)}
                        className="w-full rounded px-1 text-left text-[10px] font-medium text-primary hover:underline"
                      >
                        +{dayEvents.length - 3} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!isLoading && events.length === 0 && (
            <p className="mt-4 text-center text-sm text-muted-foreground">
              No events scheduled this month.
            </p>
          )}
        </CardContent>
      </Card>

      {/* View / detail dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle>{viewing.title}</DialogTitle>
                <DialogDescription className="flex flex-wrap gap-2 pt-1">
                  <Badge variant="outline" className="capitalize">Audience: {viewing.audience}</Badge>
                  {viewing.event_type && <Badge variant="secondary">{viewing.event_type}</Badge>}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-muted-foreground">When: </span>
                  {new Date(viewing.starts_at).toLocaleString()} – {new Date(viewing.ends_at).toLocaleString()}
                </p>
                {viewing.location && (
                  <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5" />{viewing.location}</p>
                )}
                {viewing.description && (
                  <p className="whitespace-pre-wrap rounded border bg-muted/30 p-2">{viewing.description}</p>
                )}
              </div>
              {canEdit && (
                <DialogFooter className="gap-2 sm:gap-2">
                  <Button variant="destructive" onClick={() => setConfirmDelete(viewing)}>
                    <Trash2 className="mr-1.5 h-4 w-4" />Delete
                  </Button>
                  <Button onClick={() => { setEditing(viewing); setViewing(null); }}>
                    <Pencil className="mr-1.5 h-4 w-4" />Edit
                  </Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit form */}
      <EventFormDialog
        open={!!creating || !!editing}
        initial={editing ?? (creating ? { starts_at: combineDateTime(creating.date!, "09:00"), ends_at: combineDateTime(creating.date!, "10:00") } as any : null)}
        onClose={() => { if (upsert.isPending) return; setEditing(null); setCreating(null); }}
        onSubmit={(values) => upsert.mutateAsync({ ...values, id: editing?.id })}
        submitting={upsert.isPending}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.title}" will be permanently removed. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDelete && del.mutate(confirmDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!dayDetail} onOpenChange={(o) => !o && setDayDetail(null)}>
        <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              Events on {dayDetail ? new Date(dayDetail + "T00:00").toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : ""}
            </DialogTitle>
            <DialogDescription>
              {dayDetail ? `${(byDay.get(dayDetail) ?? []).length} event${(byDay.get(dayDetail) ?? []).length === 1 ? "" : "s"}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto space-y-2">
            {dayDetail && (byDay.get(dayDetail) ?? []).map((ev) => (
              <button
                key={ev.id}
                onClick={() => { setViewing(ev); setDayDetail(null); }}
                className="block w-full rounded-md border p-3 text-left transition hover:bg-accent"
              >
                <p className="font-medium">{ev.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  {" – "}
                  {new Date(ev.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ev.event_type && <Badge variant="secondary" className="text-[10px]">{ev.event_type}</Badge>}
                  <Badge variant="outline" className="text-[10px] capitalize">Audience: {ev.audience}</Badge>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toLocalParts(iso: string) {
  const d = new Date(iso);
  const date = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  const time = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
  return { date, time };
}

interface EventFormValues {
  title: string;
  description: string;
  audience: Audience;
  event_type: string;
  location: string;
  starts_at: string;
  ends_at: string;
}

function EventFormDialog({
  open, initial, onClose, onSubmit, submitting,
}: {
  open: boolean;
  initial: Partial<EventRow> | null;
  onClose: () => void;
  onSubmit: (v: EventFormValues) => Promise<unknown> | void;
  submitting: boolean;
}) {
  const start = initial?.starts_at ? toLocalParts(initial.starts_at) : { date: ymd(new Date()), time: "09:00" };
  const end = initial?.ends_at ? toLocalParts(initial.ends_at) : { date: ymd(new Date()), time: "10:00" };

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [audience, setAudience] = useState<Audience>((initial?.audience as Audience) ?? "all");
  const [eventType, setEventType] = useState(initial?.event_type ?? "General");
  const [location, setLocation] = useState(initial?.location ?? "");
  const [date, setDate] = useState(start.date);
  const [startTime, setStartTime] = useState(start.time);
  const [endDate, setEndDate] = useState(end.date);
  const [endTime, setEndTime] = useState(end.time);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });

  // Reset when initial changes / dialog reopens
  useMemo(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setAudience((initial?.audience as Audience) ?? "all");
    setEventType(initial?.event_type ?? "General");
    setLocation(initial?.location ?? "");
    const s = initial?.starts_at ? toLocalParts(initial.starts_at) : { date: ymd(new Date()), time: "09:00" };
    const e = initial?.ends_at ? toLocalParts(initial.ends_at) : { date: s.date, time: "10:00" };
    setDate(s.date); setStartTime(s.time); setEndDate(e.date); setEndTime(e.time); setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const initialDate = start.date;
  const submittingRef = useRef(false);
  const submit = async () => {
    if (submitting || submittingRef.current) return; // guard against double-submit
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Event title is required.";
    if (!date) errs.date = "Start date is required.";
    const todayStr = ymd(new Date());
    const isNewOrDateChanged = !initial?.id || date !== initialDate;
    if (date && isNewOrDateChanged && date < todayStr) {
      errs.date = "Event date cannot be in the past.";
    }
    const startsIso = date ? combineDateTime(date, startTime) : "";
    const endsIso = date ? combineDateTime(endDate || date, endTime) : "";
    if (startsIso && endsIso && new Date(endsIso) <= new Date(startsIso)) {
      errs.end_time = "End time must be after start time.";
    }
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      const first = document.querySelector<HTMLElement>('[aria-invalid="true"]');
      first?.focus();
      return;
    }
    submittingRef.current = true;
    try {
      await onSubmit({
        title: title.trim(), description: description.trim(),
        audience, event_type: eventType, location: location.trim(),
        starts_at: startsIso, ends_at: endsIso,
      });
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit event" : "New event"}</DialogTitle>
          <DialogDescription>Visible to the selected audience on their calendars.</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => { e.preventDefault(); void submit(); }}
        >
          <fieldset disabled={submitting} className="contents">
            <div className="grid gap-3">
          <div>
            <Label>Title<RequiredMark /></Label>
            <Input
              value={title}
              aria-invalid={!!errors.title}
              className={cn(errors.title && invalidInputClass)}
              onChange={(e) => { setTitle(e.target.value); clearErr("title"); }}
              placeholder="Midterm exam"
            />
            <FieldError message={errors.title} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={eventType} onValueChange={setEventType} disabled={submitting}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Audience</Label>
              <Select value={audience} onValueChange={(v) => setAudience(v as Audience)} disabled={submitting}>
                <SelectTrigger><SelectValue placeholder="Select audience" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  <SelectItem value="teachers">Teachers</SelectItem>
                  <SelectItem value="students">Students</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Start date<RequiredMark /></Label>
              <Input
                type="date"
                value={date}
                min={initial?.id && initialDate < ymd(new Date()) ? undefined : ymd(new Date())}
                aria-invalid={!!errors.date}
                className={cn(errors.date && invalidInputClass)}
                onChange={(e) => { setDate(e.target.value); clearErr("date"); }}
              />
              <FieldError message={errors.date} />
            </div>
            <div>
              <Label>Start time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div>
              <Label>End time</Label>
              <Input
                type="time"
                value={endTime}
                aria-invalid={!!errors.end_time}
                className={cn(errors.end_time && invalidInputClass)}
                onChange={(e) => { setEndTime(e.target.value); clearErr("end_time"); }}
              />
              <FieldError message={errors.end_time} />
            </div>
          </div>
          <div>
            <Label>Location</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Auditorium, Room 201, …" />
          </div>
          <div>
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
            </div>
            <DialogFooter className="mt-4">
              <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
              <Button type="submit" disabled={submitting} aria-busy={submitting}>
                {submitting ? (initial?.id ? "Saving…" : "Creating…") : (initial?.id ? "Save changes" : "Create event")}
              </Button>
            </DialogFooter>
          </fieldset>
        </form>
      </DialogContent>
    </Dialog>
  );
}
