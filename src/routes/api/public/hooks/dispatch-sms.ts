import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { sendViaSemaphore } from "@/lib/sms/semaphore.server";
import { normalizePhMobile } from "@/lib/sms/templates";

/**
 * Public cron endpoint. Called ~every minute:
 *   1. Runs process_expired_sessions() (closes classes past their end time,
 *      inserts absent attendance rows → trigger queues absence SMS).
 *   2. Dispatches pending SMS rows from sms_logs via the configured provider.
 *
 * Auth: publishable key in the `apikey` header (same pattern as /api/public/*).
 */
export const Route = createFileRoute("/api/public/hooks/dispatch-sms")({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL!;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const admin = createClient<Database>(url, serviceKey, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // 1. Close expired sessions (secondary safeguard alongside pg_cron).
        try {
          await admin.rpc("process_expired_sessions" as never);
        } catch {
          /* non-fatal — dispatcher still processes pending SMS */
        }

        // 2. Read provider setting
        let provider: "stub" | "semaphore" = "stub";
        const { data: setting } = await admin
          .from("system_settings")
          .select("value")
          .eq("key", "sms_provider")
          .maybeSingle();
        const raw = (setting as { value: unknown } | null)?.value;
        const parsed = typeof raw === "string" ? raw.replace(/"/g, "") : raw;
        if (parsed === "semaphore") provider = "semaphore";

        // 3. Grab up to 100 pending messages, oldest first.
        const { data: pending = [] } = await admin
          .from("sms_logs")
          .select("id, phone, message")
          .eq("status", "pending")
          .order("created_at", { ascending: true })
          .limit(100);

        let sent = 0;
        let failed = 0;
        let stubbed = 0;

        for (const row of pending as Array<{ id: string; phone: string; message: string }>) {
          if (provider === "semaphore") {
            const normalized = normalizePhMobile(row.phone) ?? row.phone;
            const res = await sendViaSemaphore({ phone: normalized, message: row.message });
            await admin.from("sms_logs").update({
              status: res.status,
              provider_response: (res.providerResponse ?? null) as never,
              error_message: res.error ?? null,
            } as never).eq("id", row.id);
            if (res.status === "sent") sent++; else failed++;
          } else {
            // eslint-disable-next-line no-console
            console.info("[SMS:stub-dispatch]", row.phone, row.message);
            await admin.from("sms_logs").update({
              status: "stubbed",
              provider_response: { stub: true, dispatched: true } as never,
            } as never).eq("id", row.id);
            stubbed++;
          }
        }

        return new Response(
          JSON.stringify({ processed: pending?.length ?? 0, sent, failed, stubbed, provider }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
