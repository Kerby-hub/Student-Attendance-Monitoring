import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, MapPin, Clock, Users, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/teacher/calendar")({
  component: TeacherCalendarPage,
});

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

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

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(d.getDate() + n); return x; }
function sameDay(a: Date, b: Date) { return ymd(a) === ymd(b); }

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

function TeacherCalendarPage() {
  const [cursor, setCursor] = useState(new Date());
  const [viewing, setViewing] = useState<EventRow | null>(null);
  const [dayDetail, setDayDetail] = useState<string | null>(null);

  const monthFrom = startOfMonth(cursor);
  const monthTo = new Date(endOfMonth(cursor).getTime() + 86400000);

  // RLS on calendar_events already filters by teacher-visible audience.
  // We additionally scope the client query to "all" or "teachers" to keep the
  // list read-only and appropriate for teachers.
  const { data: events = [], isLoading, error } = useQuery({
    queryKey: ["teacher-calendar", cursor.getFullYear(), cursor.getMonth()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("calendar_events")
        .select("id, title, description, starts_at, ends_at, audience, event_type, location")
        .in("audience", ["all", "teachers"])
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
      arr.push(e);
      m.set(k, arr);
    });
    return m;
  }, [events]);

  const move = (delta: number) => {
    const c = new Date(cursor);
    c.setMonth(c.getMonth() + delta);
    setCursor(c);
  };

  const first = startOfMonth(cursor);
  const last = endOfMonth(cursor);
  const startGrid = addDays(first, -first.getDay());
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(startGrid, i));
  const today = new Date();

  return (
    <div>
      <PageHeader
        title="Calendar"
        description="View school events, exams, holidays, and announcements posted by the administrator."
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
            {isLoading ? "Loading…" : `${events.length} event${events.length === 1 ? "" : "s"} this month`}
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
                  </div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <button
                        key={ev.id}
                        onClick={() => setViewing(ev)}
                        className="flex w-full items-center gap-1 truncate rounded bg-primary/15 px-1.5 py-0.5 text-left text-[11px] font-medium text-primary hover:bg-primary/25"
                        title={ev.title}
                      >
                        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", eventTypeColor(ev.event_type))} />
                        <span className="truncate">{ev.title}</span>
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
              No events available.
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="h-4 w-4" /> Events this month
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events available.</p>
          ) : (
            events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => setViewing(ev)}
                className="block w-full rounded-lg border p-3 text-left transition hover:bg-accent"
              >
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", eventTypeColor(ev.event_type))} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight">{ev.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(ev.starts_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(ev.ends_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ev.event_type && <Badge variant="secondary" className="text-[10px]">{ev.event_type}</Badge>}
                      <Badge variant="outline" className="text-[10px] capitalize">{ev.audience}</Badge>
                    </div>
                  </div>
                </div>
              </button>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent>
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className={cn("h-3 w-3 rounded-full", eventTypeColor(viewing.event_type))} />
                  {viewing.title}
                </DialogTitle>
                <DialogDescription className="flex flex-wrap gap-2 pt-1">
                  {viewing.event_type && <Badge variant="secondary">{viewing.event_type}</Badge>}
                  <Badge variant="outline" className="capitalize">Audience: {viewing.audience}</Badge>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p>{new Date(viewing.starts_at).toLocaleString()}</p>
                    <p className="text-muted-foreground">to {new Date(viewing.ends_at).toLocaleString()}</p>
                  </div>
                </div>
                {viewing.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <p>{viewing.location}</p>
                  </div>
                )}
                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="capitalize">{viewing.audience}</p>
                </div>
                {viewing.description && (
                  <p className="whitespace-pre-wrap rounded border bg-muted/30 p-3 text-sm">{viewing.description}</p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

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
                <div className="flex items-start gap-2">
                  <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", eventTypeColor(ev.event_type))} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{ev.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(ev.starts_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      {" – "}
                      {new Date(ev.ends_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {ev.event_type && <Badge variant="secondary" className="text-[10px]">{ev.event_type}</Badge>}
                      <Badge variant="outline" className="text-[10px] capitalize">{ev.audience}</Badge>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
