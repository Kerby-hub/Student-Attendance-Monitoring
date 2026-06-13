/**
 * SMS notification service abstraction.
 * Currently uses a stub provider that only logs to sms_logs.
 * Swap in Semaphore PH or Twilio later by implementing the SmsProvider interface.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SmsProvider {
  send(args: { phone: string; message: string }): Promise<{ ok: boolean; providerResponse?: unknown }>;
}

class StubProvider implements SmsProvider {
  async send({ phone, message }: { phone: string; message: string }) {
    // eslint-disable-next-line no-console
    console.info("[SMS:stub]", phone, message);
    return { ok: true, providerResponse: { stub: true } };
  }
}

const provider: SmsProvider = new StubProvider();

export type SmsNotificationType = "absence" | "late" | "confirmation" | "announcement";

export async function sendSms(args: {
  recipientUserId?: string | null;
  phone: string;
  message: string;
  type?: SmsNotificationType;
}) {
  const result = await provider.send({ phone: args.phone, message: args.message });
  await (supabase as any).from("sms_logs").insert({
    recipient_user_id: args.recipientUserId ?? null,
    phone: args.phone,
    message: args.message,
    status: result.ok ? "stubbed" : "failed",
    provider_response: result.providerResponse ?? null,
  });
  return result;
}
