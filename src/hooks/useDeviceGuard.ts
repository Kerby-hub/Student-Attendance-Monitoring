import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getDeviceInfo } from "@/lib/device/fingerprint";
import { checkOrRegisterDevice } from "@/lib/device/device.functions";

type State = "idle" | "checking" | "ok" | "blocked";

/**
 * Validates the current device fingerprint against the user's registered device.
 * On mismatch / disabled device, signs the user out and redirects to /login.
 * Runs once after the user is fully authenticated and past must_change_password.
 */
export function useDeviceGuard(enabled: boolean) {
  const { user, profile, signOut } = useAuth();
  const navigate = useNavigate();
  const checkFn = useServerFn(checkOrRegisterDevice);
  const [state, setState] = useState<State>("idle");

  useEffect(() => {
    if (!enabled) return;
    if (!user || !profile) return;
    if (profile.must_change_password) return;
    if (state !== "idle") return;

    let cancelled = false;
    (async () => {
      setState("checking");
      try {
        const info = await getDeviceInfo();
        const result = await checkFn({ data: info });
        if (cancelled) return;
        if (result.ok) {
          setState("ok");
        } else {
          setState("blocked");
          toast.error("Device not authorized", { description: result.message, duration: 10000 });
          await signOut();
          navigate({ to: "/login", replace: true });
        }
      } catch (e) {
        if (cancelled) return;
        setState("ok"); // fail-open on transient errors; server still RLS-protects writes
        console.error("Device check failed", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, user, profile, state, checkFn, navigate, signOut]);

  return state;
}
