import "server-only";
import { db, schema, type Tx } from "./db";

/** Append-only audit trail of administrative actions (permissions, publication, access...). */
export async function audit(
  e: { actorType: "admin" | "recipient" | "system"; actorUserId?: string | null; action: string;
       targetType?: string; targetId?: string; details?: Record<string, unknown>; ip?: string | null },
  tx?: Tx,
) {
  await (tx ?? db()).insert(schema.auditEvents).values({
    actorType: e.actorType, actorUserId: e.actorUserId ?? null, action: e.action,
    targetType: e.targetType ?? null, targetId: e.targetId ?? null, details: e.details ?? null, ip: e.ip ?? null,
  });
}
