import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { db, schema } from "./db";
import type { Recipient } from "./db/schema";
import { requiredLegalVersions, hasValidAcceptance, revokeAllSessions } from "./recipient-state";
export { requiredLegalVersions, hasValidAcceptance, revokeAllSessions };

export type SessionInfo = NonNullable<Awaited<ReturnType<ReturnType<typeof auth>["api"]["getSession"]>>>;

export async function currentSession(): Promise<SessionInfo | null> {
  return auth().api.getSession({ headers: await headers() });
}

/* ------------------------------ admins ------------------------------ */

export interface AdminCtx { userId: string; email: string; name: string; sessionId: string }

/** Admin = role admin AND TOTP enrolled. Without MFA enrolled only /admin/mfa is reachable. */
export async function getAdmin(opts: { allowWithoutMfa?: boolean } = {}): Promise<AdminCtx | null> {
  const s = await currentSession();
  if (!s) return null;
  const u = s.user as typeof s.user & { role?: string; twoFactorEnabled?: boolean | null };
  if (u.role !== "admin") return null;
  if (!u.twoFactorEnabled && !opts.allowWithoutMfa) return null;
  return { userId: u.id, email: u.email, name: u.name, sessionId: s.session.id };
}

export async function requireAdmin(): Promise<AdminCtx> {
  const s = await currentSession();
  const u = s?.user as (NonNullable<typeof s>["user"] & { role?: string; twoFactorEnabled?: boolean | null }) | undefined;
  if (!s || u?.role !== "admin") redirect("/admin/login");
  if (!u.twoFactorEnabled) redirect("/admin/mfa");
  return { userId: u.id, email: u.email, name: u.name, sessionId: s.session.id };
}

/* ---------------------------- recipients ---------------------------- */

export type RecipientGate =
  | { ok: false; reason: "no_session" | "not_recipient" | "revoked" | "not_started" | "expired" | "session_too_old" }
  | { ok: true; stage: "onboarding" | "ready"; recipient: Recipient; userId: string; sessionId: string; email: string };

export async function recipientGate(): Promise<RecipientGate> {
  const s = await currentSession();
  if (!s) return { ok: false, reason: "no_session" };
  const u = s.user as typeof s.user & { role?: string };
  if (u.role !== "recipient") return { ok: false, reason: "not_recipient" };
  const r = await db().query.recipients.findFirst({ where: eq(schema.recipients.userId, u.id) });
  if (!r) return { ok: false, reason: "not_recipient" };
  const now = Date.now();
  if (r.status === "revoked" || r.status === "suspended" || r.status === "draft") {
    await revokeAllSessions(u.id);
    return { ok: false, reason: "revoked" };
  }
  if (r.accessStartsAt && r.accessStartsAt.getTime() > now) return { ok: false, reason: "not_started" };
  if (r.accessExpiresAt && r.accessExpiresAt.getTime() <= now) {
    await revokeAllSessions(u.id);
    return { ok: false, reason: "expired" };
  }
  // per-recipient re-verification policy
  if (now - new Date(s.session.createdAt).getTime() > r.sessionMaxHours * 3600_000) {
    await db().delete(schema.session).where(eq(schema.session.id, s.session.id));
    return { ok: false, reason: "session_too_old" };
  }
  const stage = (await hasValidAcceptance(r)) ? "ready" : "onboarding";
  return { ok: true, stage, recipient: r, userId: u.id, sessionId: s.session.id, email: u.email };
}

/** For pages: redirects instead of returning failures. */
export async function requireRecipient(stage: "onboarding" | "ready" = "ready") {
  const g = await recipientGate();
  if (!g.ok) redirect(`/access?reason=${g.reason}`);
  if (stage === "ready" && g.stage !== "ready") redirect("/onboarding");
  return g;
}

