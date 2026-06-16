/**
 * Server-only Semaphore SMS provider.
 * Not imported anywhere on the client — guarded by the .server.ts suffix.
 */
export interface SemaphoreSendResult {
  ok: boolean;
  status: "sent" | "failed";
  error?: string;
  providerResponse?: unknown;
}

/**
 * Send an SMS via Semaphore. Expects a PH-normalized number (e.g. +639XXXXXXXXX
 * or 09XXXXXXXXX — Semaphore accepts both). Returns a structured result rather
 * than throwing, so the caller can persist failures to sms_logs.
 */
export async function sendViaSemaphore(args: {
  phone: string;
  message: string;
}): Promise<SemaphoreSendResult> {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const sender = process.env.SEMAPHORE_SENDER_NAME;
  if (!apiKey) {
    return { ok: false, status: "failed", error: "SEMAPHORE_API_KEY not configured" };
  }

  // Semaphore accepts local PH format (09XXXXXXXXX). Convert from +63 if needed.
  const localNumber = args.phone.startsWith("+63")
    ? `0${args.phone.slice(3)}`
    : args.phone;

  const form = new URLSearchParams();
  form.set("apikey", apiKey);
  form.set("number", localNumber);
  form.set("message", args.message);
  if (sender) form.set("sendername", sender);

  try {
    const res = await fetch("https://api.semaphore.co/api/v4/messages", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const text = await res.text();
    let body: unknown;
    try { body = JSON.parse(text); } catch { body = text; }

    if (!res.ok) {
      const lower = text.toLowerCase();
      let error = `Semaphore HTTP ${res.status}`;
      if (lower.includes("credit")) error = "Insufficient SMS credits";
      else if (lower.includes("number") || lower.includes("recipient")) error = "Invalid mobile number";
      else if (lower.includes("apikey") || res.status === 401) error = "Invalid Semaphore API key";
      return { ok: false, status: "failed", error, providerResponse: body };
    }
    return { ok: true, status: "sent", providerResponse: body };
  } catch (e: any) {
    return { ok: false, status: "failed", error: `Network error: ${e?.message ?? "unknown"}` };
  }
}
