import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MapPin, Clock, Users, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCurrentSemester, useCurrentAcademicYear } from "@/lib/academic/hooks";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/calendar")({
  component: StudentCalendarPage,
});

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const MONTH = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type View = "month" | "week" | "day";
type EventRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  audience: string;
  event_type: string | null;
  location: string | null;
};

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d: Date) { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(d.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

// Map event type to a colored dot
function eventTypeColor(t: string | null): string {
  switch ((t ?? "").toLowerCase()) {
    case "holiday": return "bg-red-500";
    case "exam": return "bg-orange-500";
    case "meeting": return "bg-blue-500";
    case "activity": return "bg-emerald-500";
    case "deadline": return "bg-amber-500";
    default: return "bg-primary";
  }
}

function StudentCalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [focusEvent, setFocusEvent] = useState<EventRow | null>(null);

  const { data: student } = useQuery({
    queryKey: ["my-student", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("students").select("id, section_id").eq("user_id", user!.id).maybeSingle()).data,
  });

  const { data: records = [] } = useQuery({
    queryKey: ["cal-records", student?.id, cursor.getFullYear(), cursor.getMonth()],
    enabled: !!student?.id,
    queryFn: async () => {
      const from = startOfMonth(cursor).toISOString();
      const to = new Date(endOfMonth(cursor).getTime() + 86400000).toISOString();
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id, status, check_in_at, attendance_sessions(class_schedules(subjects(code,name)))")
        .eq("student_id", student!.id)
        .gte("check_in_at", from).lt("check_in_at", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: currentSemester } = useCurrentSemester();
  const { data: currentYear } = useCurrentAcademicYear();

  const { data: schedules = [] } = useQuery({
    queryKey: ["cal-schedules", student?.section_id, currentSemester?.id, currentYear?.id],
    enabled: !!student?.section_id,
    queryFn: async () => {
      let q = supabase
        .from("class_schedules")
        .select("id, day, start_time, end_time, room, semester_id, academic_year_id, subjects(code,name), teachers(full_name)")
        .eq("section_id", student!.section_id!);
      // Restrict to the active academic year & semester when available.
      if (currentSemester?.id) q = q.eq("semester_id", currentSemester.id);
      else if (currentYear?.id) q = q.eq("academic_year_id", currentYear.id);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Events for the visible month (RLS already filters by audience for students)
  const { data: events = [] } = useQuery({
    queryKey: ["cal-events", cursor.getFullYear(), cursor.getMonth()],
    queryFn: async () => {
      const from = startOfMonth(cursor).toISOString();
      const to = new Date(endOfMonth(cursor).getTime() + 86400000).toISOString();
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, description, starts_at, ends_at, audience, event_type, location")
        .gte("starts_at", from).lt("starts_at", to)
        .order("starts_at");
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  // Upcoming events from today onwards (next 60 days)
  const { data: upcoming = [] } = useQuery({
    queryKey: ["cal-upcoming"],
    queryFn: async () => {
      const now = new Date();
      const future = new Date(now.getTime() + 60 * 86400000);
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, description, starts_at, ends_at, audience, event_type, location")
        .gte("starts_at", now.toISOString())
        .lt("starts_at", future.toISOString())
        .order("starts_at")
        .limit(10);
      if (error) throw error;
      return (data ?? []) as EventRow[];
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, { records: typeof records; events: EventRow[]; classes: typeof schedules }>();
    records.forEach((r) => {
      if (!r.check_in_at) return;
      const k = ymd(new Date(r.check_in_at));
      const e = map.get(k) ?? { records: [], events: [], classes: [] };
      e.records.push(r); map.set(k, e);
    });
    events.forEach((ev) => {
      const k = ymd(new Date(ev.starts_at));
      const e = map.get(k) ?? { records: [], events: [], classes: [] };
      e.events.push(ev); map.set(k, e);
    });
    return map;
  }, [records, events]);

  const classesForDate = (d: Date) => {
    const day = DAY_NAMES[d.getDay()];
    return schedules.filter((s) => s.day === day);
  };

  const move = (delta: number) => {
    const c = new Date(cursor);
    if (view === "month") c.setMonth(c.getMonth() + delta);
    else if (view === "week") c.setDate(c.getDate() + delta * 7);
    else c.setDate(c.getDate() + delta);
    setCursor(c);
  };

  const title =
    view === "month" ? `${MONTH[cursor.getMonth()]} ${cursor.getFullYear()}` :
    view === "week" ? `Week of ${startOfWeek(cursor).toLocaleDateString()}` :
    cursor.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const selectedEntry = selectedDate ? byDay.get(ymd(selectedDate)) : undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Attendance, classes, and school events.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
              <CardTitle className="min-w-0">{title}</CardTitle>
              <Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={() => { setCursor(new Date()); setSelectedDate(new Date()); }}>Today</Button>
            </div>
            <div className="flex gap-1 rounded-lg border p-1">
              {(["month","week","day"] as View[]).map((v) => (
                <Button key={v} size="sm" variant={view === v ? "default" : "ghost"} className="capitalize" onClick={() => setView(v)}>
                  {v}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            {view === "month" && (
              <MonthGrid
                cursor={cursor}
                byDay={byDay}
                classesForDate={classesForDate}
                onSelectDate={(d) => setSelectedDate(d)}
                selectedDate={selectedDate}
              />
            )}
            {view === "week" && (
              <WeekList cursor={cursor} byDay={byDay} classesForDate={classesForDate} onEventClick={setFocusEvent} />
            )}
            {view === "day" && (
              <DayList date={cursor} entry={byDay.get(ymd(cursor))} classes={classesForDate(cursor)} onEventClick={setFocusEvent} />
            )}
            <Legend />
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* Selected-day events panel (month view) */}
          {view === "month" && selectedDate && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selectedDate.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {(selectedEntry?.events ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events on this date.</p>
                ) : (
                  selectedEntry!.events.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => setFocusEvent(ev)}
                      className="block w-full rounded-lg border p-3 text-left transition hover:bg-accent"
                    >
                      <div className="flex items-start gap-2">
                        <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", eventTypeColor(ev.event_type))} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-tight">{ev.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            {" – "}
                            {new Date(ev.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </p>
                          {ev.event_type && <Badge variant="secondary" className="mt-1 text-[10px]">{ev.event_type}</Badge>}
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </CardContent>
            </Card>
          )}

          {/* Upcoming events */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarDays className="h-4 w-4" /> Upcoming events
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {upcoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No upcoming events.</p>
              ) : (
                upcoming.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => setFocusEvent(ev)}
                    className="block w-full rounded-lg border p-3 text-left transition hover:bg-accent"
                  >
                    <div className="flex items-start gap-2">
                      <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", eventTypeColor(ev.event_type))} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{ev.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(ev.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                          {" · "}
                          {new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <EventDetailsDialog event={focusEvent} onClose={() => setFocusEvent(null)} />
    </div>
  );
}

function EventDetailsDialog({ event, onClose }: { event: EventRow | null; onClose: () => void }) {
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {event && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className={cn("h-3 w-3 rounded-full", eventTypeColor(event.event_type))} />
                {event.title}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap gap-2 pt-1">
                {event.event_type && <Badge variant="secondary">{event.event_type}</Badge>}
                <Badge variant="outline" className="capitalize">Audience: {event.audience}</Badge>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div>
                  <p>{new Date(event.starts_at).toLocaleString()}</p>
                  <p className="text-muted-foreground">to {new Date(event.ends_at).toLocaleString()}</p>
                </div>
              </div>
              {event.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p>{event.location}</p>
                </div>
              )}
              <div className="flex items-start gap-2">
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <p className="capitalize">{event.audience}</p>
              </div>
              {event.description && (
                <p className="whitespace-pre-wrap rounded border bg-muted/30 p-3 text-sm">{event.description}</p>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex flex-wrap gap-3 text-xs">
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Present</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-yellow-500" /> Late</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-destructive" /> Absent</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-blue-500" /> Upcoming class</span>
      <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-primary" /> Event</span>
    </div>
  );
}

type DayMap = Map<string, { records: any[]; events: EventRow[]; classes: any[] }>;

function MonthGrid({
  cursor, byDay, classesForDate, onSelectDate, selectedDate,
}: {
  cursor: Date;
  byDay: DayMap;
  classesForDate: (d: Date) => { id: string }[];
  onSelectDate: (d: Date) => void;
  selectedDate: Date | null;
}) {
  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const startGrid = addDays(first, -first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(startGrid, i));
  const today = new Date();
  return (
    <div>
      <div className="mb-2 grid grid-cols-7 gap-px text-center text-xs font-medium text-muted-foreground">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-border">
        {cells.map((d) => {
          const k = ymd(d);
          const e = byDay.get(k);
          const inMonth = d.getMonth() === cursor.getMonth() && d <= last;
          const cls = classesForDate(d);
          const isSelected = selectedDate ? sameDay(d, selectedDate) : false;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onSelectDate(d)}
              className={cn(
                "min-h-[88px] bg-card p-1.5 text-left text-xs transition hover:bg-accent/50",
                !inMonth && "bg-muted/40 text-muted-foreground",
                sameDay(d, today) && "ring-2 ring-primary ring-inset",
                isSelected && "bg-primary/10",
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <span className={cn("font-medium", sameDay(d, today) && "text-primary")}>{d.getDate()}</span>
                {(e?.events?.length ?? 0) > 0 && (
                  <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-medium text-primary">
                    {e!.events.length}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-0.5">
                {e?.records.map((r, i) => (
                  <span key={`r${i}`} className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    r.status === "present" && "bg-green-500",
                    r.status === "late" && "bg-yellow-500",
                    r.status === "absent" && "bg-destructive",
                  )} />
                ))}
                {cls.length > 0 && d >= today && (!e?.records.length) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
                )}
                {e?.events.slice(0, 4).map((ev) => (
                  <span key={ev.id} className={cn("h-1.5 w-1.5 rounded-full", eventTypeColor(ev.event_type))} title={ev.title} />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeekList({
  cursor, byDay, classesForDate, onEventClick,
}: { cursor: Date; byDay: DayMap; classesForDate: (d: Date) => any[]; onEventClick: (e: EventRow) => void }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <DayList key={ymd(d)} date={d} entry={byDay.get(ymd(d))} classes={classesForDate(d)} compact onEventClick={onEventClick} />
      ))}
    </div>
  );
}

function DayList({
  date, entry, classes, compact, onEventClick,
}: {
  date: Date;
  entry: { records: any[]; events: EventRow[] } | undefined;
  classes: any[];
  compact?: boolean;
  onEventClick: (e: EventRow) => void;
}) {
  const isFuture = date >= new Date(new Date().setHours(0,0,0,0));
  return (
    <div className={cn("rounded-lg border bg-card p-3", compact && "p-2")}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className={cn("font-semibold", compact ? "text-sm" : "text-base")}>
          {date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
        </h3>
        {sameDay(date, new Date()) && <Badge>Today</Badge>}
      </div>
      <div className="space-y-2">
        {classes.length === 0 && !entry?.events?.length && !entry?.records?.length && (
          <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
        )}
        {classes.map((c: any) => {
          const subj = c.subjects;
          return (
            <div key={c.id} className="flex items-center justify-between rounded border-l-2 border-blue-500 bg-blue-500/5 p-2 text-sm">
              <div>
                <p className="font-medium">{subj ? `${subj.code} · ${subj.name}` : "Class"}</p>
                <p className="text-xs text-muted-foreground">
                  {c.start_time?.slice(0,5)}–{c.end_time?.slice(0,5)} {c.room && `· Rm ${c.room}`}
                </p>
              </div>
              {isFuture && <Badge variant="outline" className="text-blue-600">Upcoming</Badge>}
            </div>
          );
        })}
        {entry?.records?.map((r: any) => (
          <div key={r.id} className={cn(
            "rounded border-l-2 p-2 text-sm",
            r.status === "present" && "border-green-500 bg-green-500/5",
            r.status === "late" && "border-yellow-500 bg-yellow-500/5",
            r.status === "absent" && "border-destructive bg-destructive/5",
          )}>
            <div className="flex items-center justify-between">
              <span className="font-medium capitalize">{r.status}</span>
              <span className="text-xs text-muted-foreground">
                {r.check_in_at && new Date(r.check_in_at).toLocaleTimeString()}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {r.attendance_sessions?.class_schedules?.subjects ? `${r.attendance_sessions.class_schedules.subjects.code} · ${r.attendance_sessions.class_schedules.subjects.name}` : ""}
            </p>
          </div>
        ))}
        {entry?.events?.map((ev) => (
          <button
            key={ev.id}
            onClick={() => onEventClick(ev)}
            className={cn(
              "w-full rounded border-l-2 p-2 text-left text-sm transition hover:bg-accent",
              "border-primary bg-primary/5",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <p className="truncate font-medium">{ev.title}</p>
              {ev.event_type && <Badge variant="secondary" className="shrink-0 text-[10px]">{ev.event_type}</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">
              {new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {" – "}
              {new Date(ev.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              {ev.location ? ` · ${ev.location}` : ""}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}
