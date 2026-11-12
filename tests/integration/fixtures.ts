import { randomUUID, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { createDocument, uploadVersion, approveVersion, publishVersion, releaseUnscannedDev } from "@/server/documents/library";
import { processVersion } from "@/server/documents/pipeline";
import { createRecipient, addRule } from "@/server/recipients";
import { syntheticPdf } from "../../scripts/seed-demo";

export const uniq = () => randomBytes(4).toString("hex");

export async function admin() {
  const id = randomUUID();
  await db().insert(schema.user).values({ id, email: `admin-${uniq()}@example.test`, name: "Test admin", role: "admin", emailVerified: true, twoFactorEnabled: true });
  return { userId: id };
}

export async function section(code: string) {
  return (await db().query.sections.findFirst({ where: eq(schema.sections.code, code) }))!;
}

export async function activateLegalDrafts(adminId: string) {
  const drafts = await db().select().from(schema.legalTextVersions).where(eq(schema.legalTextVersions.status, "draft"));
  for (const v of drafts) {
    const active = await db().query.legalTextVersions.findFirst({ where: and(eq(schema.legalTextVersions.legalTextId, v.legalTextId), eq(schema.legalTextVersions.status, "active")) });
    if (!active) await db().update(schema.legalTextVersions).set({ status: "active", activatedAt: new Date(), activatedBy: adminId }).where(eq(schema.legalTextVersions.id, v.id));
  }
}

export async function recipient(adminId: string, opts: Partial<Parameters<typeof createRecipient>[1]> = {}) {
  const nda = (await db().query.legalTexts.findFirst({ where: eq(schema.legalTexts.key, "nda-investor") }))!;
  return createRecipient(adminId, { email: `r-${uniq()}@example.test`, displayName: `Recipient ${uniq()}`, ndaTextId: nda.id, ...opts });
}

/** Uploads a synthetic PDF and walks it through the full pipeline to `published`. */
export async function publishedDoc(a: { userId: string }, sectionCode: string, title = `Doc ${uniq()}`, pdf?: Buffer) {
  const sec = await section(sectionCode);
  const doc = await createDocument(a, { title, sectionId: sec.id });
  const { version } = await uploadVersion(a, doc.id, "doc.pdf", pdf ?? (await syntheticPdf(title, 1)));
  await processVersion(version.id);
  await releaseUnscannedDev(a, version.id);
  await approveVersion(a, version.id);
  await publishVersion(a, version.id);
  const v = (await db().query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, version.id) }))!;
  return { doc: (await db().query.documents.findFirst({ where: eq(schema.documents.id, doc.id) }))!, version: v };
}

export async function allow(adminId: string, subject: { recipientId?: string; groupId?: string }, target: { sectionId?: string; documentId?: string; versionId?: string; folderId?: string },
  caps: { dl?: boolean; orig?: boolean } = {}, effect: "allow" | "deny" = "allow") {
  const [targetType, targetId] = target.sectionId ? ["section", target.sectionId] : target.folderId ? ["folder", target.folderId] : target.documentId ? ["document", target.documentId] : ["version", target.versionId!];
  return addRule(adminId, {
    subjectType: subject.recipientId ? "recipient" : "group", subjectId: (subject.recipientId ?? subject.groupId)!,
    targetType: targetType as "section", targetId: targetId!, effect, canView: true, canDownloadWatermarked: !!caps.dl, canDownloadOriginal: !!caps.orig,
  });
}

export async function lastMailTo(email: string) {
  for (let i = 0; i < 40; i++) {
    const rows = await db().select().from(schema.devOutbox).where(eq(schema.devOutbox.to, email));
    if (rows.length) return rows.sort((x, y) => +y.createdAt - +x.createdAt)[0];
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}
export async function mailsTo(email: string) {
  await new Promise((r) => setTimeout(r, 400)); // mail sending is fire-and-forget
  return db().select().from(schema.devOutbox).where(eq(schema.devOutbox.to, email));
}
export const otpFrom = (body: string) => /(\d{6})/.exec(body)![1];
export const meta = { ip: "203.0.113.7", userAgent: "vitest" };
