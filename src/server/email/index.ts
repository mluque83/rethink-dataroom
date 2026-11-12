import "server-only";
import nodemailer from "nodemailer";
import { db, schema } from "../db";
import { env } from "../env";

export interface Mail { to: string; subject: string; text: string }

/**
 * Provider abstraction.
 *  - dev : DEVELOPMENT ONLY. Nothing leaves the machine; messages are stored in
 *          dev_outbox and shown at /dev/mailbox (disabled in production).
 *  - smtp: real provider (any SMTP relay: SES, Postmark, Brevo, Mailgun...).
 * Bodies are never written to application logs.
 */
export async function sendMail(m: Mail): Promise<void> {
  const e = env();
  if (e.EMAIL_PROVIDER === "dev") {
    if (e.APP_ENV === "production") throw new Error("dev mail provider refused in production");
    await db().insert(schema.devOutbox).values({ to: m.to, subject: m.subject, bodyText: m.text });
    return;
  }
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST, port: e.SMTP_PORT, secure: e.SMTP_SECURE,
    requireTLS: e.APP_ENV === "production",
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASSWORD } : undefined,
  });
  await transport.sendMail({ from: e.EMAIL_FROM, to: m.to, subject: m.subject, text: m.text });
}

/** Fire-and-forget (avoids response-time differences that would reveal registered addresses). */
export function sendMailInBackground(m: Mail) {
  void sendMail(m).catch((err) => console.error("[mail] delivery failed:", (err as Error).name));
}
