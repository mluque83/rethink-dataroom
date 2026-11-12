// Requirements 6, 7, 8, 9 (+ default deny, patient-data gate)
import { describe, test, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { authorizeVersion, loadLibrary, loadSubject, visibleDocuments } from "@/server/permissions";
import { uploadVersion, approveVersion, publishVersion, releaseUnscannedDev, updateDocumentMeta, DomainError } from "@/server/documents/library";
import { processVersion } from "@/server/documents/pipeline";
import { askQuestion, questionsForRecipient } from "@/server/qa";
import { syntheticPdf } from "../../scripts/seed-demo";
import { admin, recipient, publishedDoc, section, allow, uniq } from "./fixtures";

let A: { userId: string };
beforeAll(async () => { A = await admin(); });

const visibleIds = async (rid: string) => visibleDocuments((await loadSubject(rid))!, await loadLibrary()).map((v) => v.doc.id);

describe("permissions", () => {
  test("default deny: a recipient without rules sees nothing", async () => {
    await publishedDoc(A, "00");
    const r = await recipient(A.userId);
    expect(await visibleIds(r.id)).toEqual([]);
  });

  test("REQ7 individual restriction prevails over group permission", async () => {
    const s02 = await section("02");
    const d1 = await publishedDoc(A, "02");
    const [g] = await db().insert(schema.groups).values({ name: `G ${uniq()}` }).returning();
    const r1 = await recipient(A.userId, { groupIds: [g.id], allowWatermarkedDownloads: true });
    const r2 = await recipient(A.userId, { groupIds: [g.id], allowWatermarkedDownloads: true });
    await allow(A.userId, { groupId: g.id }, { sectionId: s02.id }, { dl: true });
    // r2: individual deny of view on the document → hidden despite group allow at section level
    await allow(A.userId, { recipientId: r2.id }, { documentId: d1.doc.id }, {}, "deny");
    expect(await visibleIds(r1.id)).toContain(d1.doc.id);
    expect(await visibleIds(r2.id)).not.toContain(d1.doc.id);
    // r1: individual restriction on download only → still visible, download removed
    await db().insert(schema.accessRules).values({ subjectType: "recipient", recipientId: r1.id, targetType: "document", documentId: d1.doc.id, effect: "deny", canView: false, canDownloadWatermarked: true });
    const a1 = await authorizeVersion(r1.id, d1.doc.id, d1.version.id);
    expect(a1?.caps.view).toBe(true);
    expect(a1?.caps.downloadWatermarked).toBe(false);
    // even an individual ALLOW cannot override a deny (deny always wins)
    await allow(A.userId, { recipientId: r2.id }, { documentId: d1.doc.id });
    expect(await authorizeVersion(r2.id, d1.doc.id, d1.version.id)).toBeNull();
  });

  test("downloads need rule capability AND recipient switch; original is separate", async () => {
    const d = await publishedDoc(A, "03");
    const r = await recipient(A.userId, { allowWatermarkedDownloads: false });
    await allow(A.userId, { recipientId: r.id }, { documentId: d.doc.id }, { dl: true, orig: true });
    const a = await authorizeVersion(r.id, d.doc.id, d.version.id);
    expect(a?.caps).toEqual({ view: true, downloadWatermarked: false, downloadOriginal: false });
  });

  test("REQ6 tampering with identifiers does not reach other content", async () => {
    const mine = await publishedDoc(A, "04");
    const other = await publishedDoc(A, "04");
    const r = await recipient(A.userId);
    await allow(A.userId, { recipientId: r.id }, { documentId: mine.doc.id });
    expect(await authorizeVersion(r.id, mine.doc.id, mine.version.id)).not.toBeNull();
    expect(await authorizeVersion(r.id, other.doc.id, other.version.id)).toBeNull();          // other doc
    expect(await authorizeVersion(r.id, mine.doc.id, other.version.id)).toBeNull();           // version of another doc
    expect(await authorizeVersion(r.id, other.doc.id, mine.version.id)).toBeNull();           // swapped pair
    expect(await authorizeVersion(r.id, "../../etc/passwd", mine.version.id)).toBeNull();     // malformed
    expect(await authorizeVersion(r.id, mine.doc.id, "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  test("REQ8 hidden documents do not leak through listings, Q&A or question links", async () => {
    const visible = await publishedDoc(A, "05", `Visible ${uniq()}`);
    const hidden = await publishedDoc(A, "05", `SECRET-TITLE-${uniq()}`);
    const r = await recipient(A.userId, { qaEnabled: true });
    await allow(A.userId, { recipientId: r.id }, { documentId: visible.doc.id });
    const subj = (await loadSubject(r.id))!;
    const json = JSON.stringify(visibleDocuments(subj, await loadLibrary()));
    expect(json).not.toContain(hidden.doc.title);
    expect(json).not.toContain(hidden.doc.id);
    // asking about a hidden document fails exactly like a non-existent one
    const e1 = await askQuestion(r, "s", { subject: "abc", body: "abc", documentId: hidden.doc.id }).catch((e) => (e as DomainError).code);
    const e2 = await askQuestion(r, "s", { subject: "abc", body: "abc", documentId: "00000000-0000-4000-8000-000000000001" }).catch((e) => (e as DomainError).code);
    expect(e1).toBe("not_found"); expect(e2).toBe(e1);
    // a question linked (by an admin) to a document the reader can't see shows no title
    await db().insert(schema.questions).values({ recipientId: r.id, subject: "x", body: "y", documentId: hidden.doc.id });
    expect(JSON.stringify(await questionsForRecipient(r))).not.toContain(hidden.doc.title);
  });

  test("REQ9 new versions stay private until explicitly approved AND published", async () => {
    const d = await publishedDoc(A, "06");
    const r = await recipient(A.userId);
    await allow(A.userId, { recipientId: r.id }, { documentId: d.doc.id });
    const { version: v2 } = await uploadVersion(A, d.doc.id, "v2.pdf", await syntheticPdf("v2", 1));
    const current = async () => visibleDocuments((await loadSubject(r.id))!, await loadLibrary()).find((x) => x.doc.id === d.doc.id)!.version.id;
    expect(await current()).toBe(d.version.id);
    expect(await authorizeVersion(r.id, d.doc.id, v2.id)).toBeNull();
    await processVersion(v2.id); await releaseUnscannedDev(A, v2.id);
    expect(await current()).toBe(d.version.id);
    await approveVersion(A, v2.id);
    expect(await current()).toBe(d.version.id);                       // approved ≠ published
    expect(await authorizeVersion(r.id, d.doc.id, v2.id)).toBeNull();
    await publishVersion(A, v2.id);
    expect(await current()).toBe(v2.id);
    expect(await authorizeVersion(r.id, d.doc.id, d.version.id)).toBeNull(); // superseded: only with explicit version grant
  });

  test("DB gate: cannot publish without approval, nor documents with patient data", async () => {
    const sec = await section("06");
    const d = await publishedDoc(A, "06");
    const { version: v2 } = await uploadVersion(A, d.doc.id, "v2.pdf", await syntheticPdf("v2", 1));
    await processVersion(v2.id); await releaseUnscannedDev(A, v2.id);
    // bypassing the service layer with raw SQL is still blocked by the trigger
    await expect(db().execute(sql`UPDATE document_versions SET status = 'superseded' WHERE id = ${d.version.id}`).then(() =>
      db().execute(sql`UPDATE document_versions SET status = 'published', published_by = ${A.userId} WHERE id = ${v2.id}`))).rejects.toThrow();
    // ...and a superseded version cannot be re-published without a fresh approval either
    await expect(db().execute(sql`UPDATE document_versions SET status = 'published', published_by = ${A.userId} WHERE id = ${d.version.id}`)).rejects.toThrow();
    // patient data
    const { createDocument } = await import("@/server/documents/library");
    const p = await createDocument(A, { title: "patients", sectionId: sec.id, containsPatientData: true });
    const { version } = await uploadVersion(A, p.id, "p.pdf", await syntheticPdf("p", 1));
    await processVersion(version.id); await releaseUnscannedDev(A, version.id); await approveVersion(A, version.id);
    await expect(publishVersion(A, version.id)).rejects.toMatchObject({ code: "publication_blocked" });
    const pub = await publishedDoc(A, "06");
    await expect(updateDocumentMeta(A, pub.doc.id, { containsPatientData: true })).rejects.toThrow(); // withdraw first
    expect((await db().query.documents.findFirst({ where: eq(schema.documents.id, p.id) }))!.currentPublishedVersionId).toBeNull();
  });
});
