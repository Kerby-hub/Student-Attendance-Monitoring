import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Square, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/admin/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/teacher/attendance-session/$scheduleId")({
  component: AttendanceSessionPage,
});

type Session = { id: string; schedule_id: string; status: string; qr_token: string | null; opened_at: string | null; closed_at: string | null; expires_at?: string | null };

function scheduleEndDate(endTime?: string | null, openedAt?: string | null): Date | null {
  if (!endTime) return null;
  const base = openedAt ? new Date(openedAt) : new Date();
  const [h, m, s] = endTime.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h ?? 0, m ?? 0, s ?? 0, 0);
  return d;
}

function AttendanceSessionPage() {
  const { scheduleId } = Route.useParams();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [tick, setTick] = useState(0);
  const [rotationSecs, setRotationSecs] = useState<number>(15);
  const [secsLeft, setSecsLeft] = useState(15);
  const [sessionEnded, setSessionEnded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [closeOpen, setCloseOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  // Load QR rotation interval from system_settings (fallback 15s).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("system_settings")
        .select("value")
        .eq("key", "qr_rotation_seconds")
        .maybeSingle();
      const raw = (data as { value: unknown } | null)?.value;
      const parsed = typeof raw === "number" ? raw : Number(raw);
      if (Number.isFinite(parsed) && parsed >= 5 && parsed <= 300) {
        setRotationSecs(parsed);
        setSecsLeft(parsed);
      }
    })();
  }, []);

  // Load schedule meta
  const { data: schedule } = useQuery({
    queryKey: ["schedule", scheduleId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_schedules")
        .select(`*,
          subjects:subjects!class_schedules_subject_id_fkey(code,name),
          sections:sections!class_schedules_section_id_fkey(name, id),
          semesters:semesters!class_schedules_semester_id_fkey(id, name, status, is_current)`)
        .eq("id", scheduleId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  // Find or create active session. Also run the DB-side safeguard that closes
  // any expired sessions system-wide before we look one up here.
  useEffect(() => {
    (async () => {
      try { await (supabase as any).rpc("process_expired_sessions"); } catch { /* non-fatal */ }
      const { data } = await supabase
        .from("attendance_sessions")
        .select("*")
        .eq("schedule_id", scheduleId)
        .in("status", ["waiting", "open"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) setSession(data as Session);
    })();
  }, [scheduleId]);

  // Live roster
  const { data: roster = [], refetch: refetchRoster } = useQuery({
    queryKey: ["session-roster", session?.id],
    enabled: !!session?.id,
    refetchInterval: 5000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select(`*, students:students!attendance_records_student_id_fkey(full_name, student_no)`)
        .eq("session_id", session!.id)
        .order("check_in_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  // Section student count for missing/absent
  const { data: sectionStudents = [] } = useQuery({
    queryKey: ["section-students", schedule?.sections?.id],
    enabled: !!schedule?.sections?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select("id, full_name, student_no")
        .eq("section_id", schedule.sections.id)
        .eq("status", "active");
      if (error) throw error;
      return data as any[];
    },
  });

  const checkedInIds = new Set(roster.map((r) => r.students?.id ?? r.student_id));
  const missing = sectionStudents.filter((s) => !checkedInIds.has(s.id));

  // Auto-detect scheduled end time and close the session when reached.
  useEffect(() => {
    if (!schedule?.end_time) return;
    const end = scheduleEndDate(schedule.end_time, session?.opened_at ?? null);
    if (!end) return;
    const check = async () => {
      if (Date.now() < end.getTime()) return;
      setSessionEnded(true);
      if (session && session.status === "open") {
        // DB trigger `attendance_session_on_close_trg` handles inserting
        // absent rows for students who did not check in. Do not insert here
        // — the unique (session_id, student_id) constraint would collide.
        await supabase.from("attendance_sessions")
          .update({ status: "closed", closed_at: new Date().toISOString() })
          .eq("id", session.id);
        setSession((s) => (s ? { ...s, status: "closed", closed_at: new Date().toISOString() } : s));
        refetchRoster();
        toast.info("Session ended", { description: "Scheduled end time reached. Check-in is now closed." });
      }
    };
    check();
    const t = setInterval(check, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.end_time, session?.id, session?.status, session?.opened_at]);

  // QR rotation
  useEffect(() => {
    if (!session || session.status !== "open" || sessionEnded) return;
    const rotate = async () => {
      const { data, error } = await (supabase as any).rpc("rotate_session_qr", { _session_id: session.id });
      if (error) { toast.error(error.message); return; }
      const token: string = data;
      setSession((s) => s ? { ...s, qr_token: token, status: "open" } : s);
      const png = await QRCode.toDataURL(token, { width: 360, margin: 2 });
      setQrDataUrl(png);
      setSecsLeft(rotationSecs);
      setTick((t) => t + 1);
    };
    rotate();
    intervalRef.current = setInterval(rotate, rotationSecs * 1000);
    const countdown = setInterval(() => setSecsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      clearInterval(countdown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id, session?.status, rotationSecs, sessionEnded]);

  const semesterStatus: string | undefined = schedule?.semesters?.status;
  const semesterClosed = semesterStatus === "closed" || semesterStatus === "archived";

  const startSession = async () => {
    if (semesterClosed) {
      toast.error("This semester is already closed. New attendance sessions cannot be started.");
      return;
    }
    // Refuse to start a session that is already past its scheduled end.
    const end = scheduleEndDate(schedule?.end_time, null);
    if (end && Date.now() > end.getTime()) {
      toast.error("Cannot start session — scheduled end time has already passed.");
      return;
    }
    const { data: existing } = await supabase
      .from("attendance_sessions").select("*").eq("schedule_id", scheduleId).in("status", ["waiting","open"]).maybeSingle();
    if (existing) { setSession(existing as Session); return; }
    const { data, error } = await (supabase as any)
      .from("attendance_sessions")
      .insert({
        schedule_id: scheduleId,
        teacher_id: schedule?.teacher_id,
        status: "open",
        opened_at: new Date().toISOString(),
      }).select().single();
    if (error) return toast.error(error.message);
    setSession(data as Session);
  };

  const requestClose = () => { if (session) setCloseOpen(true); };
  const performClose = async () => {
    if (!session) return;
    setClosing(true);
    try {
      await supabase.from("attendance_sessions")
        .update({ status: "closed", closed_at: new Date().toISOString() })
        .eq("id", session.id);
      // Mark missing students as absent
      if (missing.length > 0) {
        await supabase.from("attendance_records").insert(
          missing.map((s) => ({ session_id: session.id, student_id: s.id, status: "absent" }))
        );
      }
      toast.success("Session closed");
      navigate({ to: "/teacher" });
    } catch (e) {
      toast.error((e as Error).message || "Failed to close session");
    } finally {
      setClosing(false);
      setCloseOpen(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={schedule ? `${schedule.subjects?.code} — ${schedule.subjects?.name}` : "Attendance session"}
        description={schedule ? `Section ${schedule.sections?.name} • Room ${schedule.room ?? "TBA"} • ${schedule.start_time?.slice(0,5)}–${schedule.end_time?.slice(0,5)}` : ""}
        action={session?.status === "open" && !sessionEnded
          ? <Button variant="destructive" onClick={requestClose}><Square className="mr-1.5 h-4 w-4" /> Close session</Button>
          : <Button onClick={startSession} disabled={sessionEnded || session?.status === "closed" || semesterClosed}>Start session</Button>}
      />

      {semesterClosed && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold">Semester is closed</p>
          <p className="text-muted-foreground">This schedule belongs to a closed semester. New attendance sessions cannot be started.</p>
        </div>
      )}

      {sessionEnded && (
        <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold">Check-in closed</p>
          <p className="text-muted-foreground">This attendance session has ended. Students can no longer check in.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
        <Card className="shadow-[var(--shadow-elegant)]">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              QR code
              {session?.status === "open" && !sessionEnded && <Badge className="bg-success text-success-foreground">Live</Badge>}
              {(sessionEnded || session?.status === "closed") && <Badge variant="secondary">Closed</Badge>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {session?.status === "open" && !sessionEnded && qrDataUrl ? (
              <div className="space-y-3 text-center">
                <img src={qrDataUrl} alt="Attendance QR" className="rounded-lg border bg-white p-4" width={360} height={360} />
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <RefreshCw className="h-3.5 w-3.5" />
                  Rotates in {secsLeft}s (token #{tick})
                </div>
              </div>
            ) : (
              <div className="grid h-[360px] w-[360px] place-items-center rounded-lg border-2 border-dashed p-6 text-center text-muted-foreground">
                {sessionEnded || session?.status === "closed"
                  ? "Session ended. QR rotation has stopped."
                  : session ? "Generating…" : "Press Start session to begin."}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card className="shadow-[var(--shadow-card)]">
            <CardHeader><CardTitle>Checked in ({roster.length})</CardTitle></CardHeader>
            <CardContent>
              {roster.length === 0 ? (
                <p className="text-sm text-muted-foreground">No check-ins yet.</p>
              ) : (
                <ul className="space-y-1.5">
                  {roster.map((r) => (
                    <li key={r.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                      <span><span className="font-mono text-xs text-muted-foreground">{r.students?.student_no}</span> {r.students?.full_name}</span>
                      <Badge variant={r.status === "late" ? "secondary" : "default"} className="capitalize">{r.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {session && (
            <Card className="shadow-[var(--shadow-card)]">
              <CardHeader><CardTitle>Not checked in ({missing.length})</CardTitle></CardHeader>
              <CardContent>
                {missing.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Everyone is checked in.</p>
                ) : (
                  <ul className="text-sm text-muted-foreground">
                    {missing.map((s) => (
                      <li key={s.id}><span className="font-mono text-xs">{s.student_no}</span> {s.full_name}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      <ConfirmDialog
        open={closeOpen}
        onOpenChange={(v) => { if (!closing) setCloseOpen(v); }}
        title="Close attendance session?"
        description="Students will no longer be able to check in. Missing students will be marked absent."
        confirmLabel="Close session"
        loading={closing}
        loadingLabel="Closing…"
        onConfirm={performClose}
      />
    </div>
  );
}
