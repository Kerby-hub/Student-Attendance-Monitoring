import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { renderSmsTemplate, normalizePhMobile, type SmsTemplateName, type SmsTemplateVars } from "./templates";

const SendInput = z.object({
  recipientUserId: z.string().uuid().nullable().optional(),
  phone: z.string().min(1),
  template: z.enum(["absence", "late", "check_in", "check_out", "announcement"]).optional(),
  vars: z.record(z.any()).optional(),
  message: z.string().optional(),
});

type SmsStatus = "pending" | "sent" | "failed" | "stubbed";

/**
 * Send an SMS using the configured provider (stub | semaphore).
 * Always writes to sms_logs regardless of provider or outcome.
 */
export const sendSmsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SendInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;

    const body = data.message
      ?? (data.template
        ? renderSmsTemplate(data.template as SmsTemplateName, (data.vars ?? {}) as SmsTemplateVars)
        : "");
    if (!body) {
      return { ok: false, status: "failed" as SmsStatus, error: "Empty SMS body" };
    }

    // Read SMS_PROVIDER setting; default to stub.
    let provider: "stub" | "semaphore" = "stub";
    try {
      const { data: row } = await (supabase as any)
        .from("system_settings").select("value").eq("key", "sms_provider").maybeSingle();
      const v = row?.value;
      const parsed = typeof v === "string" ? v.replace(/"/g, "") : v;
      if (parsed === "semaphore") provider = "semaphore";
    } catch { /* fall through to stub */ }

    let status: SmsStatus = "stubbed";
    let providerResponse: unknown = { stub: true };
    let error: string | undefined;

    if (provider === "semaphore") {
      const normalized = normalizePhMobile(data.phone) ?? data.phone;
      try {
        const { sendViaSemaphore } = await import("./semaphore.server");
        const res = await sendViaSemaphore({ phone: normalized, message: body });
        status = res.status;
        providerResponse = res.providerResponse ?? null;
        error = res.error;
      } catch (e: any) {
        status = "failed";
        error = `Provider load error: ${e?.message ?? "unknown"}`;
      }
    } else {
      // eslint-disable-next-line no-console
      console.info("[SMS:stub]", data.phone, body);
    }

    try {
      await (supabase as any).from("sms_logs").insert({
        recipient_user_id: data.recipientUserId ?? null,
        phone: data.phone,
        message: body,
        status,
        provider_response: error ? { error, response: providerResponse } : providerResponse,
      });
    } catch { /* logging failure must not break send result */ }

    return { ok: status === "sent" || status === "stubbed", status, error };
  });
