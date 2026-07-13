/**
 * Server-only helper that sends account credential emails through the
 * currently-configured provider: stub / resend / smtp.
 *
 * This file MUST NOT be imported from client-reachable modules at module
 * scope — load it dynamically from inside a server function handler
 * (`const { sendCredentialsEmail } = await import(...)`).
 */

export type EmailProvider = "stub" | "resend" | "smtp";
export type EmailStatus = "stubbed" | "sent" | "failed";

export interface SendCredentialsInput {
  toEmail: string;
  toName: string;
  tempPassword: string;
  loginUrl: string;
  provider: EmailProvider;
}

export interface SendCredentialsResult {
  status: EmailStatus;
  provider: EmailProvider;
  info: Record<string, unknown>;
  error?: string;
}

function buildEmail(input: SendCredentialsInput) {
  const subject = "Your Student Attendance Monitoring System Account";
  const text =
    `Hello ${input.toName},\n\n` +
    `An account has been created for you in the Student Attendance Monitoring System.\n\n` +
    `Login email: ${input.toEmail}\n` +
    `Temporary password: ${input.tempPassword}\n` +
    `Login page: ${input.loginUrl}\n\n` +
    `For security, you will be required to change your password after your first login.\n` +
    `Please do not share this password with anyone.\n\nThank you.`;
  const html = text
    .split("\n")
    .map((l) => (l ? `<p style="margin:0 0 8px">${l.replace(/</g, "&lt;")}</p>` : "<br/>"))
    .join("");
  return { subject, text, html };
}

export async function sendCredentialsEmail(
  input: SendCredentialsInput,
): Promise<SendCredentialsResult> {
  const { subject, text, html } = buildEmail(input);
  const provider = input.provider;

  if (provider === "resend") {
    const key = process.env.RESEND_API_KEY;
    const fromAddr = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
    if (!key) {
      return {
        status: "failed",
        provider,
        info: { provider: "resend" },
        error: "RESEND_API_KEY is not configured on the server.",
      };
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ from: fromAddr, to: [input.toEmail], subject, html, text }),
      });
      if (res.ok) {
        const body = await res.json().catch(() => ({}));
        return { status: "sent", provider, info: { provider: "resend", id: body?.id ?? null } };
      }
      const errTxt = await res.text().catch(() => "send failed");
      return { status: "failed", provider, info: { provider: "resend" }, error: errTxt };
    } catch (err) {
      return {
        status: "failed",
        provider,
        info: { provider: "resend" },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  if (provider === "smtp") {
    const host = process.env.SMTP_HOST;
    const portRaw = process.env.SMTP_PORT || "465";
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const from = process.env.SMTP_FROM_EMAIL || (user ? `SAMS <${user}>` : undefined);
    if (!host || !user || !pass || !from) {
      return {
        status: "failed",
        provider,
        info: { provider: "smtp" },
        error:
          "SMTP is not fully configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM_EMAIL on the server.",
      };
    }
    const port = Number(portRaw) || 465;
    try {
      // Dynamic import so the client bundle never sees nodemailer.
      const nodemailer = (await import("nodemailer")).default;
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465,
        auth: { user, pass },
      });
      const info = await transporter.sendMail({
        from,
        to: input.toEmail,
        subject,
        text,
        html,
      });
      return {
        status: "sent",
        provider,
        info: {
          provider: "smtp",
          messageId: info.messageId ?? null,
          accepted: info.accepted ?? [],
          response: info.response ?? null,
        },
      };
    } catch (err) {
      return {
        status: "failed",
        provider,
        info: { provider: "smtp" },
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // stub
  return {
    status: "stubbed",
    provider: "stub",
    info: { provider: "stub", stub: true },
  };
}

/**
 * Resolve the active email provider using the admin-configured
 * `system_settings.email_provider` value first, then the `EMAIL_PROVIDER`
 * environment variable, finally defaulting to "stub".
 */
export function resolveEmailProvider(settingRaw: unknown): EmailProvider {
  const norm = (v: unknown): EmailProvider | null => {
    if (typeof v !== "string") return null;
    const s = v.replace(/^"|"$/g, "").trim().toLowerCase();
    if (s === "resend" || s === "smtp" || s === "stub") return s;
    return null;
  };
  return norm(settingRaw) ?? norm(process.env.EMAIL_PROVIDER) ?? "stub";
}
