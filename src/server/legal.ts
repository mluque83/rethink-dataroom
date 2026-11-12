import "server-only";
import { createHash } from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { requiredLegalVersions } from "./recipient-state";
import type { RecipientGate } from "./authz";
import { recordActivity, notifyAdmins } from "./activity";
import { audit } from "./audit";
import type { RequestMeta } from "./security";

export const ACCEPT_LABELS = {
  es: {
    checkbox: "He leído íntegramente las condiciones de uso y el acuerdo de confidencialidad (NDA) y los acepto. He sido informado/a del tratamiento de datos y del registro de actividad descritos en el aviso de privacidad.",
    action: "Aceptar y acceder",
  },
  en: {
    checkbox: "I have read the terms of use and the non-disclosure agreement (NDA) in full and accept them. I have been informed of the data processing and activity logging described in the privacy notice.",
    action: "Accept and access",
  },
} as const;

type V = typeof schema.legalTextVersions.$inferSelect;

/** Deterministic composition of exactly what is displayed (the page renders this same string). */
export function composeAgreementText(p: { nda: V; terms: V; privacy: V; ndaTitle: string; termsTitle: string; privacyTitle: string }) {
  const block = (title: string, v: V) => `=== ${title} — versión/version ${v.versionLabel} (${v.language}) ===\n\n${v.body.trim()}\n`;
  return [block(p.termsTitle, p.terms), block(p.ndaTitle, p.nda), block(p.privacyTitle, p.privacy)].join("\n");
}

export async function currentAgreement(recipient: Parameters<typeof requiredLegalVersions>[0]) {
  const req = await requiredLegalVersions(recipient);
  if (!req.nda || !req.terms || !req.privacy) return null;
  const texts = await db().select().from(schema.legalTexts);
  const title = (id: string) => texts.find((t) => t.id === id)?.title ?? "";
  const nda = req.nda, terms = req.terms, privacy = req.privacy;
  const text = composeAgreementText({ nda, terms, privacy, ndaTitle: title(nda.legalTextId), termsTitle: title(terms.legalTextId), privacyTitle: title(privacy.legalTextId) });
  return { nda, terms, privacy, text, sha256: createHash("sha256").update(text, "utf8").digest("hex"), titles: { nda: title(nda.legalTextId), terms: title(terms.legalTextId), privacy: title(privacy.legalTextId) } };
}

export const acceptanceInput = z.object({
  fullName: z.string().trim().min(3).max(200),
  company: z.string().trim().max(200).optional().default(""),
  position: z.string().trim().max(200).optional().default(""),
  actingCapacity: z.enum(["personal", "on_behalf"]),
  representedEntity: z.string().trim().max(200).optional().default(""),
  authorityDeclared: z.boolean(),
  accepted: z.literal(true),
  /** hash of the text the page displayed; must equal the current server-side composition */
  displayedSha256: z.string().regex(/^[0-9a-f]{64}$/),
  locale: z.enum(["es", "en"]),
});

export class AgreementChangedError extends Error {}

export async function acceptAgreement(g: Extract<RecipientGate, { ok: true }>, raw: unknown, meta: RequestMeta) {
  const input = acceptanceInput.parse(raw);
  if (input.actingCapacity === "on_behalf" && (!input.representedEntity || !input.authorityDeclared)) throw new Error("on_behalf_requires_entity_and_declaration");
  const ag = await currentAgreement(g.recipient);
  if (!ag) throw new Error("no_active_legal_texts");
  if (ag.sha256 !== input.displayedSha256) throw new AgreementChangedError("texts changed while displayed");
  const labels = ACCEPT_LABELS[input.locale];
  const row = await db().transaction(async (tx) => {
    const [idDecl] = await tx.insert(schema.identityDeclarations).values({
      recipientId: g.recipient.id, fullName: input.fullName, company: input.company || null, position: input.position || null,
      actingCapacity: input.actingCapacity, representedEntity: input.actingCapacity === "on_behalf" ? input.representedEntity : null,
      authorityDeclared: input.actingCapacity === "on_behalf" ? input.authorityDeclared : false, sessionId: g.sessionId,
    }).returning();
    const [acc] = await tx.insert(schema.acceptances).values({
      recipientId: g.recipient.id, userId: g.userId, verifiedEmail: g.email, identityDeclarationId: idDecl.id,
      declaredFullName: input.fullName, declaredCompany: input.company || null, declaredPosition: input.position || null,
      actingCapacity: input.actingCapacity, representedEntity: input.actingCapacity === "on_behalf" ? input.representedEntity : null,
      ndaVersionId: ag.nda.id, termsVersionId: ag.terms.id, privacyVersionId: ag.privacy.id,
      displayedText: ag.text, displayedTextSha256: ag.sha256, checkboxLabel: labels.checkbox, actionLabel: labels.action,
      locale: input.locale, sessionId: g.sessionId, ipAddress: meta.ip, userAgent: meta.userAgent,
      recordHash: "computed-by-trigger",
    }).returning();
    await audit({ actorType: "recipient", actorUserId: g.userId, action: "agreement.accepted", targetType: "recipient", targetId: g.recipient.id,
      details: { acceptanceId: acc.id, ndaVersionId: ag.nda.id, termsVersionId: ag.terms.id, privacyVersionId: ag.privacy.id, sha256: ag.sha256 } }, tx);
    return acc;
  });
  await recordActivity({ recipientId: g.recipient.id, sessionId: g.sessionId, kind: "nda_accepted", ip: meta.ip, userAgent: meta.userAgent });
  await notifyAdmins("nda_accepted", g.recipient, { ndaVersion: ag.nda.versionLabel });
  return row;
}

export async function acceptancesOf(recipientId: string) {
  return db().select().from(schema.acceptances).where(eq(schema.acceptances.recipientId, recipientId)).orderBy(desc(schema.acceptances.seq));
}

/** Recomputes the whole chain in PostgreSQL. Tamper EVIDENCE for ordinary edits, not absolute proof. */
export async function verifyAcceptanceChain() {
  const r = await db().execute<{ id: string; link_ok: boolean; record_ok: boolean; text_ok: boolean }>(sql`SELECT * FROM dr_verify_acceptance_chain()`);
  const bad = r.rows.filter((x) => !x.link_ok || !x.record_ok || !x.text_ok);
  return { ok: bad.length === 0, checked: r.rows.length, broken: bad.map((b) => b.id) };
}
