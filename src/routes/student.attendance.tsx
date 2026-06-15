import { createFileRoute } from "@tanstack/react-router";
import { Component, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Camera,
  CheckCircle2,
  XCircle,
  MapPin,
  AlertTriangle,
  RefreshCw,
  ScanLine,
  KeyRound,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export const Route = createFileRoute("/student/attendance")({
  component: StudentAttendancePage,
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
  camera_unsupported: "Camera not supported",
  camera_notfound: "No camera found",
  insecure_context: "HTTPS required",
  scanner_load_failed: "Scanner failed to load",
  unknown: "Something went wrong",
};

// Top-level error boundary so a render crash never produces the
// "This page didn't load" white screen — the manual fallback stays visible.
class ScannerErrorBoundary extends Component<
  { children: ReactNode; onError?: (err: unknown) => void },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: unknown) {
    // Swallow — page still renders the fallback below.
    this.props.onError?.(error);
    // eslint-disable-next-line no-console
    console.warn("[StudentAttendance] boundary caught:", error);
  }
  render() {
    if (this.state.error) {
      return (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Scanner unavailable</AlertTitle>
          <AlertDescription>
            The camera scanner could not start on this device. Use the manual attendance code below
            to check in.
          </AlertDescription>
        </Alert>
      );
    }
    return this.props.children;
  }
}

function StudentAttendancePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Scan QR to check in</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Point your camera at the QR code displayed by your teacher, or enter the code manually.
        </p>
      </div>
      <ScannerErrorBoundary>
        <StudentScanner />
      </ScannerErrorBoundary>
    </div>
  );
}

function StudentScanner() {
  const qc = useQueryClient();
  const reactContainerId = useId().replace(/:/g, "_");
  // html5-qrcode mounts video/canvas inside this inner div. We keep an outer
  // wrapper that React always owns, so React's reconciler never tries to
  // diff nodes html5-qrcode created/removed (which is what produces the
  // "Failed to execute 'removeChild' on 'Node'" crash).
  const innerId = `qr-reader-inner-${reactContainerId}`;

  const [mounted, setMounted] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [isSecure, setIsSecure] = useState(true);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scannerRef = useRef<any>(null);
  const startingRef = useRef(false);
  const cleanedUpRef = useRef(false);
  const handlingRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (typeof window !== "undefined") {
      const secure =
        window.isSecureContext ||
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
      setIsSecure(secure);
    }
    return () => {
      cleanedUpRef.current = true;
      // Fire-and-forget. Errors are swallowed inside.
      void safeTeardown(scannerRef, innerId);
      scannerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopScanner = async () => {
    await safeTeardown(scannerRef, innerId);
    scannerRef.current = null;
    setScanning(false);
  };

  const getLocation = (): Promise<GeolocationPosition> =>
    new Promise((resolve, reject) => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        reject({ code: "geo_unavailable", message: "Geolocation is not supported on this device." });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        resolve,
        (err) => {
          reject({
            code: err.code === 1 ? "geo_denied" : "geo_unavailable",
            message:
              err.code === 1
                ? "Please allow location access to verify your attendance."
                : "Could not determine your location.",
          });
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
      );
    });

  const extractToken = (raw: string): string => {
    let token = raw.trim();
    try {
      const parsed = JSON.parse(token);
      if (parsed?.t) token = parsed.t;
    } catch {
      if (token.includes("?t=")) {
        try {
          token = new URL(token).searchParams.get("t") ?? token;
        } catch {
          /* not a URL */
        }
      }
    }
    return token;
  };

  const submitToken = async (rawToken: string) => {
    if (handlingRef.current) return;
    handlingRef.current = true;
    setBusy(true);
    try {
      const token = extractToken(rawToken);
      if (!token) {
        setResult({ kind: "error", code: "invalid_token", message: "Empty attendance code." });
        return;
      }

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
    if (startingRef.current || scannerRef.current) return;
    startingRef.current = true;
    setResult(null);
    setCameraError(null);

    if (typeof window === "undefined") {
      startingRef.current = false;
      return;
    }

    const secure =
      window.isSecureContext ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!secure) {
      setCameraError(
        "Camera access requires HTTPS. Open the app over ngrok / Vercel / Netlify, or use the manual code below.",
      );
      startingRef.current = false;
      return;
    }

    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      setCameraError(
        "Your browser does not support camera access. Try a recent Chrome, Safari, or Firefox.",
      );
      startingRef.current = false;
      return;
    }

    let Html5Qrcode: typeof import("html5-qrcode").Html5Qrcode;
    try {
      const mod = await import("html5-qrcode");
      Html5Qrcode = mod.Html5Qrcode;
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load QR scanner.";
      setCameraError(`QR scanner library failed to load: ${msg}`);
      startingRef.current = false;
      return;
    }

    // Confirm the inner div exists before handing it to html5-qrcode.
    if (typeof document === "undefined" || !document.getElementById(innerId)) {
      setCameraError("Scanner container is not ready. Please reload the page.");
      startingRef.current = false;
      return;
    }

    setScanning(true);
    try {
      const scanner = new Html5Qrcode(innerId, /* verbose */ false);
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          await submitToken(decoded);
        },
        () => {
          /* ignore per-frame decode errors */
        },
      );
    } catch (e) {
      setScanning(false);
      // Detach the failed instance without touching DOM we don't own.
      try {
        if (scannerRef.current?._isScanning) await scannerRef.current.stop();
      } catch {
        /* ignore */
      }
      scannerRef.current = null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const err = e as any;
      const name = err?.name || "";
      let msg = err?.message || String(e) || "Camera could not start.";
      if (name === "NotAllowedError" || /permission/i.test(msg)) {
        msg = "Camera permission was denied. Please allow camera access in your browser settings.";
      } else if (name === "NotFoundError" || /not found|no camera/i.test(msg)) {
        msg = "No camera was found on this device.";
      } else if (name === "NotReadableError") {
        msg = "The camera is in use by another app. Close it and try again.";
      } else if (name === "SecurityError") {
        msg = "Camera blocked for security reasons. Open the app over HTTPS.";
      }
      setCameraError(msg);
    } finally {
      startingRef.current = false;
    }
  };

  const submitManual = async () => {
    if (!manualCode.trim()) {
      toast.error("Enter an attendance code first.");
      return;
    }
    await submitToken(manualCode);
  };

  const reset = () => {
    setResult(null);
    setCameraError(null);
    setManualCode("");
  };

  return (
    <div className="space-y-6">
      {mounted && !isSecure && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>HTTPS required for camera</AlertTitle>
          <AlertDescription>
            Camera access requires HTTPS. You can still use the manual attendance code below.
          </AlertDescription>
        </Alert>
      )}

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
            <Row
              label="Status"
              value={
                <Badge
                  variant={result.status === "late" ? "secondary" : "default"}
                  className="capitalize"
                >
                  {result.status}
                </Badge>
              }
            />
            <div className="pt-3">
              <Button variant="outline" onClick={reset}>
                <RefreshCw className="mr-2 h-4 w-4" /> Scan another
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : result?.kind === "error" ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
              {result.code === "outside_zone" ? (
                <MapPin className="h-7 w-7" />
              ) : result.code === "duplicate" ? (
                <AlertTriangle className="h-7 w-7" />
              ) : (
                <XCircle className="h-7 w-7" />
              )}
            </div>
            <div>
              <CardTitle>{ERROR_TITLES[result.code] ?? "Failed"}</CardTitle>
              <p className="text-sm text-muted-foreground">{result.message}</p>
            </div>
          </CardHeader>
          <CardContent>
            <Button onClick={reset}>
              <RefreshCw className="mr-2 h-4 w-4" /> Try again
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 p-4 sm:p-6">
              {/* React owns the outer wrapper. html5-qrcode mounts/removes
                  children inside the inner div, which React never touches. */}
              <div className="mx-auto aspect-square w-full max-w-md overflow-hidden rounded-lg border-2 border-dashed border-muted bg-muted/30">
                <div id={innerId} className="h-full w-full">
                  {!scanning && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
                      <ScanLine className="h-10 w-10 text-primary" />
                      <p>
                        Press <strong>Open Scanner</strong> below to activate your camera.
                      </p>
                    </div>
                  )}
                </div>
              </div>
              {cameraError && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Camera unavailable</AlertTitle>
                  <AlertDescription>
                    {cameraError} You can still enter the attendance code manually below.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex flex-wrap items-center justify-center gap-2">
                {!scanning ? (
                  <Button size="lg" onClick={startScanner} disabled={busy || !mounted}>
                    <Camera className="mr-2 h-5 w-5" /> Open Scanner
                  </Button>
                ) : (
                  <Button size="lg" variant="outline" onClick={stopScanner}>
                    Stop
                  </Button>
                )}
              </div>
              <p className="text-center text-xs text-muted-foreground">
                You must be within the classroom geofence and the session must be open.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" /> Manual attendance code
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="manual-code">Session token</Label>
                <Input
                  id="manual-code"
                  placeholder="Paste or type the attendance code"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="off"
                  spellCheck={false}
                />
              </div>
              <Button onClick={submitManual} disabled={busy || !manualCode.trim()}>
                Submit code
              </Button>
              <p className="text-xs text-muted-foreground">
                Use this if your camera does not open. Ask your teacher for the session code shown
                under the QR.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// Safely stop + clear html5-qrcode without throwing if the underlying
// DOM nodes were already removed by React. This is what prevents the
// "Failed to execute 'removeChild' on 'Node'" crash on unmount.
async function safeTeardown(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ref: React.MutableRefObject<any>,
  containerId: string,
) {
  const s = ref.current;
  if (!s) return;
  try {
    if (s._isScanning || (typeof s.getState === "function" && s.getState() === 2)) {
      await s.stop();
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof document !== "undefined" && document.getElementById(containerId)) {
      await s.clear();
    }
  } catch {
    /* ignore — html5-qrcode sometimes throws when React already unmounted */
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b py-2 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
