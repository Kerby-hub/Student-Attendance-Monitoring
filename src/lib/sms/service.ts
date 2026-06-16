/**
 * Client-side SMS facade. Delegates to the server function which handles
 * provider selection (stub | semaphore) and writes to sms_logs.
 */
import { sendSmsFn } from "./sms.functions";
import type { SmsTemplateName, SmsTemplateVars } from "./templates";

export type SmsNotificationType = "absence" | "late" | "confirmation" | "announcement";

export async function sendSms(args: {
  recipientUserId?: string | null;
  phone: string;
  message?: string;
  template?: SmsTemplateName;
  vars?: SmsTemplateVars;
  type?: SmsNotificationType;
}) {
  return sendSmsFn({
    data: {
      recipientUserId: args.recipientUserId ?? null,
      phone: args.phone,
      message: args.message,
      template: args.template,
      vars: args.vars,
    },
  });
}

export { renderSmsTemplate, normalizePhMobile } from "./templates";
export type { SmsTemplateName, SmsTemplateVars } from "./templates";
