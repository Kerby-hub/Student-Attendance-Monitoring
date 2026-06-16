/**
 * SMS message templates. Pure functions — safe to import on client or server.
 * Keep messages under 160 chars where possible to stay in 1 SMS segment.
 */
export type SmsTemplateName =
  | "absence"
  | "late"
  | "check_in"
  | "check_out"
  | "announcement";

export interface SmsTemplateVars {
  studentName?: string;
  subject?: string;
  time?: string;
  date?: string;
  message?: string;
}

export function renderSmsTemplate(name: SmsTemplateName, vars: SmsTemplateVars = {}): string {
  const who = vars.studentName ?? "Student";
  const sub = vars.subject ?? "class";
  const when = vars.time ?? vars.date ?? "today";
  switch (name) {
    case "absence":
      return `[SAMS] ${who} was marked ABSENT for ${sub} on ${when}.`;
    case "late":
      return `[SAMS] ${who} was marked LATE for ${sub} at ${when}.`;
    case "check_in":
      return `[SAMS] ${who} checked IN for ${sub} at ${when}.`;
    case "check_out":
      return `[SAMS] ${who} checked OUT of ${sub} at ${when}.`;
    case "announcement":
      return `[SAMS] ${vars.message ?? ""}`.trim();
  }
}

/**
 * Normalize PH mobile numbers to E.164 (+63XXXXXXXXXX).
 * Accepts: 09XXXXXXXXX, 9XXXXXXXXX, 639XXXXXXXXX, +639XXXXXXXXX.
 * Returns null when the input cannot be normalized.
 */
export function normalizePhMobile(input: string): string | null {
  if (!input) return null;
  const digits = input.replace(/[^\d]/g, "");
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  return null;
}
