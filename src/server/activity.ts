import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";
import { getSetting } from "./settings";
import { sendMailInBackground } from "./email";
import { adminNotificationMail } from "./email/templates";
import type { Recipient } from "./db/schema";

/**
 * Server-confirmed recipient activity. Callers MUST NOT invoke this for admin
 * previews (`ctx.preview === true`) — preview code paths never reach here.
 */
export async function recordActivity(e: {
  recipientId: string; sessionId: string; kind: "session_start" | "document_open" | "page_view" | "download_watermarked" | "download_original" | "question_created" | "nda_accepted";
  documentId?: string; versionId?: string; pageNumber?: number; viewSessionId?: string; ip?: string | null; userAgent?: string | null;
}) {
  if (e.kind === "page_view" && !(await getSetting("tracking")).detailedMetricsEnabled) return;
  await db().insert(schema.activityEvents).values({
    recipientId: e.recipientId, sessionId: e.sessionId, kind: e.kind, documentId: e.documentId ?? null, versionId: e.versionId ?? null,
    pageNumber: e.pageNumber ?? null, viewSessionId: e.viewSessionId ?? null, ipAddress: e.ip ?? null, userAgent: e.userAgent ?? null,
  });
}

export async function notifyAdmins(kind: "first_visit" | "nda_accepted" | "access_request" | "question_created", recipient: Pick<Recipient, "id" | "displayName" | "email">, extra: Record<string, unknown> = {}) {
  const cfg = await getSetting("notifications");
  const enabled = { first_visit: cfg.firstVisit, nda_accepted: cfg.ndaAccepted, access_request: cfg.accessRequest, question_created: cfg.questionCreated }[kind];
  if (!enabled) return;
  await db().insert(schema.notifications).values({ kind, recipientId: recipient.id, payload: { name: recipient.displayName, ...extra } });
  for (const to of cfg.emailTo) sendMailInBackground({ to, ...adminNotificationMail(kind, recipient.displayName, env().APP_URL) });
}

/* ---------------------------- active time ---------------------------- */

export interface HeartbeatInput { viewSessionId: string; seq: number; visible: boolean; active: boolean; page?: number }

/**
 * Pure crediting rule (unit-tested):
 *   credit = clamp(now − max(lastBeatAt, clockCreditedUntil), 0, maxCredit)
 *   only if the tab is visible AND there was user interaction within idleSeconds
 *   (the client reports `active`), and the beat is not a duplicate.
 * - `lastBeatAt` = previous heartbeat of this viewer (or opening time).
 * - `clockCreditedUntil` = per-recipient wall clock: the same second is never
 *   credited twice, even with several tabs/documents open simultaneously.
 * - `maxCredit` caps the time attributed to a single interval, so a lost
 *   connection or abrupt close never inflates time.
 */
export function computeCredit(p: { now: number; lastBeatAt: number; clockCreditedUntil: number | null; visible: boolean; active: boolean; maxCreditMs: number }) {
  if (!p.visible || !p.active) return 0;
  const from = Math.max(p.lastBeatAt, p.clockCreditedUntil ?? 0);
  return Math.max(0, Math.min(p.now - from, p.maxCreditMs));
}

export async function recordHeartbeat(recipientId: string, hb: HeartbeatInput, now = new Date()) {
  const cfg = await getSetting("tracking");
  if (!cfg.detailedMetricsEnabled) return { credited: 0, duplicate: false };
  return db().transaction(async (tx) => {
    // lock the viewer row; ensures ordering per viewer
    const vs = await tx.execute<{ id: string; recipient_id: string; opened_at: Date; last_heartbeat_at: Date | null }>(
      sql`SELECT id, recipient_id, opened_at, last_heartbeat_at FROM view_sessions WHERE id = ${hb.viewSessionId} FOR UPDATE`);
    const v = vs.rows[0];
    if (!v || v.recipient_id !== recipientId) return { credited: 0, duplicate: false, rejected: true };
    // idempotency: (viewSessionId, seq) is the primary key
    const ins = await tx.insert(schema.heartbeats).values({
      viewSessionId: hb.viewSessionId, seq: hb.seq, visible: hb.visible, active: hb.active, pageNumber: hb.page ?? null, receivedAt: now,
    }).onConflictDoNothing().returning();
    if (!ins.length) return { credited: 0, duplicate: true };

    await tx.execute(sql`INSERT INTO activity_clock (recipient_id, credited_until) VALUES (${recipientId}, to_timestamp(0)) ON CONFLICT DO NOTHING`);
    const clk = await tx.execute<{ credited_until: Date }>(sql`SELECT credited_until FROM activity_clock WHERE recipient_id = ${recipientId} FOR UPDATE`);
    const lastBeatAt = new Date(v.last_heartbeat_at ?? v.opened_at).getTime();
    const credited = computeCredit({
      now: now.getTime(), lastBeatAt, clockCreditedUntil: new Date(clk.rows[0].credited_until).getTime(),
      visible: hb.visible, active: hb.active, maxCreditMs: cfg.maxCreditSeconds * 1000,
    });
    if (credited > 0) {
      await tx.update(schema.activityClock).set({ creditedUntil: now }).where(eq(schema.activityClock.recipientId, recipientId));
      await tx.update(schema.heartbeats).set({ creditedMs: credited })
        .where(and(eq(schema.heartbeats.viewSessionId, hb.viewSessionId), eq(schema.heartbeats.seq, hb.seq)));
    }
    await tx.update(schema.viewSessions).set({ lastHeartbeatAt: now, activeMs: sql`${schema.viewSessions.activeMs} + ${credited}` })
      .where(eq(schema.viewSessions.id, hb.viewSessionId));
    return { credited, duplicate: false };
  });
}
