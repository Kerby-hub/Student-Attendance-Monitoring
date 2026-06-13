import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/student/calendar")({
  component: StudentCalendarPage,
});

const DAY_NAMES = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
const MONTH = ["January","February","March","April","May","June","July","August","September","October","November","December"];

type View = "month" | "week" | "day";

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function startOfWeek(d: Date) { const x = new Date(d); x.setDate(d.getDate() - d.getDay()); x.setHours(0,0,0,0); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(d.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate(); }
function ymd(d: Date) { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }

function StudentCalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(new Date());

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

  const { data: schedules = [] } = useQuery({
    queryKey: ["cal-schedules", student?.section_id],
    enabled: !!student?.section_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedules")
        .select("id, day, start_time, end_time, room, subjects(code,name), teachers(full_name)")
        .eq("section_id", student!.section_id!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: events = [] } = useQuery({
    queryKey: ["cal-events", cursor.getFullYear(), cursor.getMonth()],
    queryFn: async () => {
      const from = startOfMonth(cursor).toISOString();
      const to = new Date(endOfMonth(cursor).getTime() + 86400000).toISOString();
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, starts_at, ends_at, audience")
        .gte("starts_at", from).lt("starts_at", to);
      if (error) throw error;
      return data ?? [];
    },
  });

  const byDay = useMemo(() => {
    const map = new Map<string, { records: typeof records; events: typeof events; classes: typeof schedules }>();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">My calendar</h1>
        <p className="mt-1 text-sm text-muted-foreground">Attendance, classes, and school events.</p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => move(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <CardTitle className="min-w-0">{title}</CardTitle>
            <Button variant="outline" size="icon" onClick={() => move(1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
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
          {view === "month" && <MonthGrid cursor={cursor} byDay={byDay} classesForDate={classesForDate} />}
          {view === "week" && <WeekList cursor={cursor} byDay={byDay} classesForDate={classesForDate} />}
          {view === "day" && <DayList date={cursor} entry={byDay.get(ymd(cursor))} classes={classesForDate(cursor)} />}
          <Legend />
        </CardContent>
      </Card>
    </div>
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

type DayEntry = { records: { status: string }[]; events: { title: string }[] } | undefined;

function MonthGrid({ cursor, byDay, classesForDate }: { cursor: Date; byDay: Map<string, DayEntry & object>; classesForDate: (d: Date) => { id: string }[] }) {
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
          return (
            <div key={k} className={cn(
              "min-h-[80px] bg-card p-1.5 text-xs",
              !inMonth && "bg-muted/40 text-muted-foreground",
              sameDay(d, today) && "ring-2 ring-primary ring-inset"
            )}>
              <div className="mb-1 flex items-center justify-between">
                <span className={cn("font-medium", sameDay(d, today) && "text-primary")}>{d.getDate()}</span>
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
                {e?.events.map((_, i) => <span key={`e${i}`} className="h-1.5 w-1.5 rounded-full bg-primary" />)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekList({ cursor, byDay, classesForDate }: { cursor: Date; byDay: Map<string, any>; classesForDate: (d: Date) => any[] }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <DayList key={ymd(d)} date={d} entry={byDay.get(ymd(d))} classes={classesForDate(d)} compact />
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DayList({ date, entry, classes, compact }: { date: Date; entry: any; classes: any[]; compact?: boolean }) {
  const isFuture = date > new Date();
  return (
    <div className={cn("rounded-lg border bg-card p-4", compact && "p-3")}>
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
        {entry?.events?.map((ev: any) => (
          <div key={ev.id} className="rounded border-l-2 border-primary bg-primary/5 p-2 text-sm">
            <p className="font-medium">{ev.title}</p>
            <p className="text-xs text-muted-foreground">School event</p>
          </div>
        ))}
      </div>
    </div>
  );
}
