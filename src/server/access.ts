import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import { auth } from "./auth";
import { classifyClient, normalizeEmail, rateLimit, securityLog, sha256Hex, EMAIL_RE, type RequestMeta } from "./security";
import { notifyAdmins, recordActivity } from "./activity";
import { audit } from "./audit";
import type { Recipient } from "./db/schema";

/**
 * All functions in this module return GENERIC outcomes to the caller, so the
 * UI never reveals whether an e-mail address is registered or an invitation
 * exists. Details go only to the (pseudonymised) security log.
 */

function recipientUsable(r: Recipient | undefined, now = Date.now()) {
  if (!r) return false;
  if (!["invited", "active"].includes(r.status)) return false;
  if (r.accessStartsAt && r.accessStartsAt.getTime() > now) return false;
  if (r.accessExpiresAt && r.accessExpiresAt.getTime() <= now) return false;
  return true;
}

async function sendOtp(email: string) {
  await auth().api.sendVerificationOTP({ body: { email, type: "sign-in" } });
}

/** Step 1 (first access): invitation token from the link + the e-mail typed by the person. */
export async function beginInvitation(token: string, emailInput: string, meta: RequestMeta): Promise<{ ok: true; throttled?: boolean }> {
  const email = normalizeEmail(emailInput);
  const ipKey = meta.ip ?? "unknown";
  const tokenHash = sha256Hex(token || "");
  const allowed = await rateLimit("inv-ip", ipKey, 20, 900) && await rateLimit("inv-token", tokenHash, 8, 900) && await rateLimit("otp-email", email, 5, 900);
  if (!allowed) {
    await securityLog({ kind: "rate_limited.invitation", email, ip: meta.ip });
    return { ok: true, throttled: true };
  }
  if (!EMAIL_RE.test(email) || !/^[A-Za-z0-9_-]{40,60}$/.test(token)) {
    await securityLog({ kind: "invitation.malformed", ip: meta.ip });
    return { ok: true };
  }
  const d = db();
  const inv = await d.query.invitations.findFirst({ where: eq(schema.invitations.tokenHash, tokenHash) });
  const r = inv ? await d.query.recipients.findFirst({ where: eq(schema.recipients.id, inv.recipientId) }) : undefined;
  const valid = !!inv && ["created", "sent", "verified"].includes(inv.status) && inv.expiresAt.getTime() > Date.now();
  if (inv && inv.expiresAt.getTime() <= Date.now() && ["created", "sent"].includes(inv.status)) {
    await d.update(schema.invitations).set({ status: "expired" }).where(eq(schema.invitations.id, inv.id));
  }
  // Forwarded link: token is valid but typed e-mail differs → no code is sent anywhere.
  const emailMatches = !!r && r.email === email;
  if (valid && emailMatches && recipientUsable(r)) {
    if (!(await rateLimit("otp-resend-cooldown", email, 1, 45))) return { ok: true, throttled: true };
    await sendOtp(email);
    await securityLog({ kind: "otp.requested.invitation", recipientId: r!.id, email, ip: meta.ip, clientClass: classifyClient(meta.userAgent) });
  } else {
    await securityLog({ kind: "invitation.rejected", recipientId: r?.id ?? null, email, ip: meta.ip,
      details: { tokenKnown: !!inv, tokenValid: valid, emailMatches, recipientUsable: recipientUsable(r) } });
  }
  return { ok: true };
}

/** Returning access (after the first verified entry) — only for already activated recipients. */
export async function requestCode(emailInput: string, meta: RequestMeta): Promise<{ ok: true; throttled?: boolean }> {
  const email = normalizeEmail(emailInput);
  const allowed = await rateLimit("code-ip", meta.ip ?? "unknown", 20, 900) && await rateLimit("otp-email", email, 5, 900);
  if (!allowed) { await securityLog({ kind: "rate_limited.code", email, ip: meta.ip }); return { ok: true, throttled: true }; }
  if (!EMAIL_RE.test(email)) return { ok: true };
  const r = await db().query.recipients.findFirst({ where: eq(schema.recipients.email, email) });
  if (r && r.status === "active" && recipientUsable(r)) {
    if (!(await rateLimit("otp-resend-cooldown", email, 1, 45))) return { ok: true, throttled: true };
    await sendOtp(email);
    await securityLog({ kind: "otp.requested.returning", recipientId: r.id, email, ip: meta.ip });
  } else {
    await securityLog({ kind: "otp.request.ignored", recipientId: r?.id ?? null, email, ip: meta.ip, details: { status: r?.status ?? null } });
    if (r && r.status === "revoked") await notifyAdmins("access_request", r, { reason: "revoked_recipient_requested_code" });
  }
  return { ok: true };
}

export type VerifyResult = { ok: true; stage: "onboarding" | "ready" } | { ok: false; error: "invalid_or_expired" | "throttled" };

/**
 * Step 2: verify the one-time code. Creates an authenticated, revocable
 * session (HttpOnly cookie) through Better Auth. Codes: hashed at rest,
 * 10-minute TTL, single use, max 5 attempts, new request invalidates old code.
 */
export async function verifyCode(emailInput: string, code: string, meta: RequestMeta, reqHeaders: Headers): Promise<VerifyResult> {
  const email = normalizeEmail(emailInput);
  if (!(await rateLimit("verify-ip", meta.ip ?? "unknown", 30, 900))) return { ok: false, error: "throttled" };
  const r = await db().query.recipients.findFirst({ where: eq(schema.recipients.email, email) });
  if (!r || !recipientUsable(r) || !/^\d{6}$/.test(code)) {
    await securityLog({ kind: "otp.verify.failed", recipientId: r?.id ?? null, email, ip: meta.ip, details: { reason: "precheck" } });
    return { ok: false, error: "invalid_or_expired" };
  }
  try {
    await auth().api.signInEmailOTP({ body: { email, otp: code }, headers: reqHeaders });
  } catch (e) {
    await securityLog({ kind: "otp.verify.failed", recipientId: r.id, email, ip: meta.ip, details: { code: (e as { body?: { code?: string } }).body?.code ?? "error" } });
    return { ok: false, error: "invalid_or_expired" };
  }
  return afterVerified(r, meta);
}

/** Bookkeeping after a successful OTP verification (session already created). */
export async function afterVerified(r: Recipient, meta: RequestMeta): Promise<VerifyResult> {
  const d = db();
  const firstTime = r.status === "invited";
  const sess = await d.select().from(schema.session).where(eq(schema.session.userId, r.userId)).orderBy(desc(schema.session.createdAt)).limit(1);
  if (firstTime) {
    await d.update(schema.recipients).set({ status: "active", updatedAt: new Date() }).where(eq(schema.recipients.id, r.id));
    await d.update(schema.invitations).set({ status: "verified", firstVerifiedAt: new Date() })
      .where(and(eq(schema.invitations.recipientId, r.id), inArray(schema.invitations.status, ["created", "sent"])));
    await notifyAdmins("first_visit", r);
    await audit({ actorType: "recipient", actorUserId: r.userId, action: "recipient.first_verified", targetType: "recipient", targetId: r.id });
  }
  // A verified OTP is the only event counted as an authenticated visit (never link fetches).
  await recordActivity({ recipientId: r.id, sessionId: sess[0]?.id ?? "unknown", kind: "session_start", ip: meta.ip, userAgent: meta.userAgent });
  await securityLog({ kind: "otp.verify.success", recipientId: r.id, email: r.email, ip: meta.ip });
  const { hasValidAcceptance } = await import("./recipient-state");
  return { ok: true, stage: (await hasValidAcceptance({ ...r, status: "active" })) ? "ready" : "onboarding" };
}
