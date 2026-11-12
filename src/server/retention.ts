import "server-only";
import { sql } from "drizzle-orm";
import { db } from "./db";
import { getSetting } from "./settings";
import { audit } from "./audit";

/**
 * Retention policy (configurable in Settings):
 *  - activity (viewing metrics): after N months IP/user-agent are removed (anonymised) and
 *    raw heartbeats deleted; aggregate events are kept without technical identifiers.
 *  - security logs: deleted after M months.
 *  - contractual evidence (acceptances, identity declarations): NEVER touched by this job
 *    (append-only at DB level); period to be confirmed by counsel.
 * Runs inside a transaction that sets app.retention = on, the only way the
 * append-only triggers allow modifications.
 */
export async function applyRetention(adminId: string | null, opts: { dryRun: boolean }) {
  const r = await getSetting("retention");
  const act = `${r.activityMonths} months`, sec = `${r.securityMonths} months`;
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.retention = 'on'`);
    const q = async (stmt: ReturnType<typeof sql>) => Number((await tx.execute<{ n: number }>(stmt)).rows[0]?.n ?? 0);
    let activityAnonymized, heartbeatsDeleted, securityDeleted, viewSessionsPruned;
    if (opts.dryRun) {
      activityAnonymized = await q(sql`SELECT count(*)::int n FROM activity_events WHERE at < now() - ${act}::interval AND anonymized_at IS NULL`);
      heartbeatsDeleted = await q(sql`SELECT count(*)::int n FROM heartbeats WHERE received_at < now() - ${act}::interval`);
      securityDeleted = await q(sql`SELECT count(*)::int n FROM security_events WHERE at < now() - ${sec}::interval`);
      viewSessionsPruned = 0;
    } else {
      activityAnonymized = await q(sql`WITH u AS (UPDATE activity_events SET ip_address = NULL, user_agent = NULL, anonymized_at = now()
        WHERE at < now() - ${act}::interval AND anonymized_at IS NULL RETURNING 1) SELECT count(*)::int n FROM u`);
      heartbeatsDeleted = await q(sql`WITH d AS (DELETE FROM heartbeats WHERE received_at < now() - ${act}::interval RETURNING 1) SELECT count(*)::int n FROM d`);
      securityDeleted = await q(sql`WITH d AS (DELETE FROM security_events WHERE at < now() - ${sec}::interval RETURNING 1) SELECT count(*)::int n FROM d`);
      viewSessionsPruned = 0;
      await audit({ actorType: adminId ? "admin" : "system", actorUserId: adminId, action: "retention.applied", details: { activityAnonymized, heartbeatsDeleted, securityDeleted, policy: r } }, tx);
    }
    return { activityAnonymized, heartbeatsDeleted, securityDeleted, viewSessionsPruned };
  });
}

/** Erasure/objection request for one recipient's viewing metrics. Contractual evidence is preserved. */
export async function anonymizeRecipientActivity(adminId: string, recipientId: string) {
  return db().transaction(async (tx) => {
    await tx.execute(sql`SET LOCAL app.retention = 'on'`);
    await tx.execute(sql`UPDATE activity_events SET ip_address = NULL, user_agent = NULL, anonymized_at = now() WHERE recipient_id = ${recipientId}`);
    await tx.execute(sql`DELETE FROM heartbeats WHERE view_session_id IN (SELECT id FROM view_sessions WHERE recipient_id = ${recipientId})`);
    await audit({ actorType: "admin", actorUserId: adminId, action: "retention.recipient_anonymized", targetType: "recipient", targetId: recipientId }, tx);
  });
}
