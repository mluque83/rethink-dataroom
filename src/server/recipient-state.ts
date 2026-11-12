import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "./db";
import type { Recipient } from "./db/schema";

export async function requiredLegalVersions(recipient: Pick<Recipient, "ndaTextId" | "locale">) {
  const d = db();
  const sfx = recipient.locale === "en" ? "-en" : "";
  const terms = await d.query.legalTexts.findFirst({ where: eq(schema.legalTexts.key, `terms${sfx}`) });
  const privacy = await d.query.legalTexts.findFirst({ where: eq(schema.legalTexts.key, `privacy${sfx}`) });
  const ids = [recipient.ndaTextId, terms?.id, privacy?.id].filter(Boolean) as string[];
  const active = await d.select().from(schema.legalTextVersions)
    .where(and(inArray(schema.legalTextVersions.legalTextId, ids), eq(schema.legalTextVersions.status, "active")));
  const pick = (id?: string) => active.find((v) => v.legalTextId === id) ?? null;
  return { nda: pick(recipient.ndaTextId), terms: pick(terms?.id), privacy: pick(privacy?.id) };
}

/**
 * Has the recipient a valid acceptance for the currently required texts?
 * A newer active version invalidates a previous acceptance only if it is
 * flagged `requiresReacceptance` (material change). Privacy notice is
 * informational (not consent) — a new version only triggers re-display when flagged.
 */
export async function hasValidAcceptance(recipient: Recipient): Promise<boolean> {
  const req = await requiredLegalVersions(recipient);
  if (!req.nda || !req.terms || !req.privacy) return false; // fail closed: no active texts → no access
  const last = await db().query.acceptances.findFirst({
    where: eq(schema.acceptances.recipientId, recipient.id), orderBy: desc(schema.acceptances.seq),
  });
  if (!last) return false;
  const stale = (accepted: string, active: typeof req.nda) => accepted !== active!.id && active!.requiresReacceptance;
  return !(stale(last.ndaVersionId, req.nda) || stale(last.termsVersionId, req.terms) || stale(last.privacyVersionId, req.privacy));
}

export async function revokeAllSessions(userId: string) {
  await db().delete(schema.session).where(eq(schema.session.userId, userId));
}
