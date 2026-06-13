import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, CheckCircle2, XCircle, MapPin, AlertTriangle, RefreshCw, ScanLine } from "lucide-react";
import { Html5Qrcode } from "html5-qrcode";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/student/attendance")({
  component: StudentScannerPage,
});

type ScanResult =
  | { kind: "success"; status: string; subject: string; teacher: string; checkInAt: string }
  | { kind: "error"; code: string; message: string };

const ERROR_TITLES: Record<string, string> = {
  invalid_token: "Invalid QR code",
  expired_token: "QR code expired",
  outside_zone: "Outside the allowed area",
  duplicate: "Already checked in",
  no_student: "Student record not found",
  no_session: "Session is closed",
  geo_denied: "Location permission denied",
  geo_unavailable: "Location unavailable",
  camera_denied: "Camera permission denied",
  unknown: "Something went wrong",
};

function StudentScannerPage() {
  const qc = useQueryClient();
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-reader";
  const handlingRef = useRef(false);

  const stopScanner = async () => {
    try {
      if (scannerRef.current) {
        const s = scannerRef.current;
        // @ts-expect-error html5-qrcode internal state
        if (s._isScanning) await s.stop();
        await s.clear();
      }
    } catch {
      // ignore
    } finally {
      scannerRef.current = null;
      setScanning(false);
    }
  };

  useEffect(() => {
    return () => {
      void stopScanner();
    };
  }, []);

  const getLocation = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: "geo_unavailable", message: "Geolocation is not supported on this device." });
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, (err) => {
        reject({
          code: err.code === 1 ? "geo_denied" : "geo_unavailable",
          message: err.code === 1 ? "Please allow location access to verify your attendance." : "Could not determine your location.",
        });
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });

  const submitToken = async (token: string) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setBusy(true);
    try {
      let pos: GeolocationPosition;
      try {
        pos = await getLocation();
      } catch (e) {
        const err = e as { code: string; message: string };
        setResult({ kind: "error", code: err.code, message: err.message });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("student_check_in", {
        _qr_token: token,
        _lat: pos.coords.latitude,
        _lng: pos.coords.longitude,
      });
      if (error) {
        setResult({ kind: "error", code: "unknown", message: error.message });
        return;
      }
      const payload = data as { ok: boolean; code?: string; message: string; status?: string };
      if (!payload.ok) {
        setResult({ kind: "error", code: payload.code ?? "unknown", message: payload.message });
        return;
      }

      // Fetch session details for success card
      const { data: sess } = await supabase
        .from("attendance_sessions")
        .select("id, class_schedules(subjects(code,name), teachers(full_name))")
        .eq("qr_token", token)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sched: any = sess?.class_schedules;
      const subject = sched?.subjects ? `${sched.subjects.code} · ${sched.subjects.name}` : "Class";
      const teacher = sched?.teachers?.full_name ?? "—";

      setResult({
        kind: "success",
        status: payload.status ?? "present",
        subject,
        teacher,
        checkInAt: new Date().toLocaleString(),
      });
      qc.invalidateQueries({ queryKey: ["my-attendance"] });
      qc.invalidateQueries({ queryKey: ["my-notifications"] });
      toast.success("Attendance recorded");
    } finally {
      setBusy(false);
      handlingRef.current = false;
      await stopScanner();
    }
  };

  const startScanner = async () => {
    setResult(null);
    setCameraError(null);
    setScanning(true);
    try {
      const scanner = new Html5Qrcode(containerId);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          // Accept raw token or token wrapped in a URL/JSON
          let token = decoded.trim();
          try {
            const parsed = JSON.parse(token);
            if (parsed?.t) token = parsed.t;
          } catch {
            if (token.includes("?t=")) token = new URL(token).searchParams.get("t") ?? token;
          }
          await submitToken(token);
        },
        () => { /* per-frame decode errors are noisy; ignore */ },
      );
    } catch (e) {
      setScanning(false);
      const msg = e instanceof Error ? e.message : "Camera could not start.";
      setCameraError(msg);
    }
  };

  const reset = () => {
    setResult(null);
    setCameraError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Scan QR to check in</h1>
        <p className="mt-1 text-sm text-muted-foreground">Point your camera at the QR code displayed by your teacher.</p>
      </div>

      {result?.kind === "success" ? (
        <Card className="border-green-500/30 bg-green-50/40 dark:bg-green-950/20">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-green-500/15 text-green-600">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <div>
              <CardTitle>Attendance recorded</CardTitle>
              <p className="text-xs text-muted-foreground">Your check-in has been saved.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Subject" value={result.subject} />
            <Row label="Teacher" value={result.teacher} />
            <Row label="Check-in time" value={result.checkInAt} />
            <Row label="Status" value={<Badge variant={result.status === "late" ? "secondary" : "default"} className="capitalize">{result.status}</Badge>} />
            <div className="pt-3">
              <Button variant="outline" onClick={reset}><RefreshCw className="mr-2 h-4 w-4" /> Scan another</Button>
            </div>
          </CardContent>
        </Card>
      ) : result?.kind === "error" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
              {result.code === "outside_zone" ? <MapPin className="h-7 w-7" />
                : result.code === "duplicate" ? <AlertTriangle className="h-7 w-7" />
                : <XCircle className="h-7 w-7" />}
            </div>
            <div>
              <CardTitle>{ERROR_TITLES[result.code] ?? "Failed"}</CardTitle>
              <p className="text-sm text-muted-foreground">{result.message}</p>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={reset}><RefreshCw className="mr-2 h-4 w-4" /> Try again</Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div
              id={containerId}
              className="mx-auto aspect-square w-full max-w-md overflow-hidden rounded-lg border-2 border-dashed border-muted bg-muted/30"
            >
              {!scanning && (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <ScanLine className="h-10 w-10 text-primary" />
                  <p>Press <strong>Start scanning</strong> below to activate your camera.</p>
                </div>
              )}
            </div>
            {cameraError && (
              <p className="text-sm text-destructive">
                Camera error: {cameraError}. Make sure camera access is allowed for this site.
              </p>
            )}
            <div className="flex flex-wrap items-center justify-center gap-2">
              {!scanning ? (
                <Button size="lg" onClick={startScanner} disabled={busy}>
                  <Camera className="mr-2 h-5 w-5" /> Start scanning
                </Button>
              ) : (
                <Button size="lg" variant="outline" onClick={stopScanner}>Stop</Button>
              )}
            </div>
            <p className="text-center text-xs text-muted-foreground">
              You must be within the classroom geofence and the session must be open.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
