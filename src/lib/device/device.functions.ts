/**
 * Server functions for the One Account, One Device policy.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CheckInput = {
  fingerprint: string;
  deviceName: string;
  userAgent: string;
  platform: string;
};

export type DeviceCheckResult =
  | { ok: true; status: "registered" | "matched" }
  | { ok: false; code: "device_mismatch" | "device_disabled"; message: string };

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden: admin role required.");
}

export const checkOrRegisterDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: CheckInput) => data)
  .handler(async ({ data, context }): Promise<DeviceCheckResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const now = new Date().toISOString();

    const { data: existing } = await supabaseAdmin
      .from("device_registrations")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existing) {
      await supabaseAdmin.from("device_registrations").insert({
        user_id: userId,
        device_fingerprint: data.fingerprint,
        device_name: data.deviceName,
        user_agent: data.userAgent,
        platform: data.platform,
        status: "active",
        registration_date: now,
        last_login: now,
      });
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "device_registered",
        entity_type: "device_registrations",
        entity_id: userId,
        metadata: { device_name: data.deviceName, platform: data.platform },
      });
      return { ok: true, status: "registered" };
    }

    if (existing.status === "disabled") {
      return {
        ok: false,
        code: "device_disabled",
        message: "This device has been disabled by your administrator.",
      };
    }

    if (existing.device_fingerprint !== data.fingerprint) {
      await supabaseAdmin.from("audit_logs").insert({
        actor_id: userId,
        action: "device_mismatch_blocked",
        entity_type: "device_registrations",
        entity_id: userId,
        metadata: { attempted_device: data.deviceName, platform: data.platform },
      });
      return {
        ok: false,
        code: "device_mismatch",
        message:
          "Access denied. This account is already registered to another device. Please contact the administrator for device reset.",
      };
    }

    await supabaseAdmin
      .from("device_registrations")
      .update({ last_login: now, device_name: data.deviceName })
      .eq("user_id", userId);

    return { ok: true, status: "matched" };
  });

export const adminResetDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("device_registrations").delete().eq("user_id", data.userId);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: "device_reset",
      entity_type: "device_registrations",
      entity_id: data.userId,
      metadata: {},
    });
    return { ok: true };
  });

export const adminSetDeviceStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; status: "active" | "disabled" }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin
      .from("device_registrations")
      .update({ status: data.status })
      .eq("user_id", data.userId);
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: context.userId,
      action: data.status === "disabled" ? "device_disabled" : "device_enabled",
      entity_type: "device_registrations",
      entity_id: data.userId,
      metadata: { status: data.status },
    });
    return { ok: true };
  });
