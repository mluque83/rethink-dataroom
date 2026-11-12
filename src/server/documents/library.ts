import "server-only";
import { and, desc, eq, max, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { storage, newKey, sha256 } from "../storage";
import { audit } from "../audit";
import { validateUpload, sanitizeFilename } from "./validate";
import type { AdminCtx } from "../authz";

export class DomainError extends Error {
  constructor(public code: string, message?: string) { super(message ?? code); }
}

export interface DocMeta {
  title: string; sectionId: string; folderId?: string | null; product?: string | null; market?: string | null;
  documentDate?: string | null; ownerName?: string | null; confidentiality?: string; validityStatus?: string;
  validUntil?: string | null; nextReviewAt?: string | null; source?: string | null; notes?: string | null;
  tags?: string[]; containsPatientData?: boolean; isDemo?: boolean;
}

export async function createDocument(admin: Pick<AdminCtx, "userId">, meta: DocMeta, extra: { kind?: "standard" | "redacted"; redactedFromVersionId?: string } = {}) {
  const [doc] = await db().insert(schema.documents).values({
    title: meta.title.trim().slice(0, 300), sectionId: meta.sectionId, folderId: meta.folderId || null,
    product: meta.product || null, market: meta.market || null, documentDate: meta.documentDate || null,
    ownerName: meta.ownerName || null, confidentiality: meta.confidentiality ?? "confidential",
    validityStatus: meta.validityStatus ?? "pending_verification", validUntil: meta.validUntil || null,
    nextReviewAt: meta.nextReviewAt || null, source: meta.source || null, notes: meta.notes || null,
    tags: meta.tags ?? [], containsPatientData: !!meta.containsPatientData, isDemo: !!meta.isDemo,
    kind: extra.kind ?? "standard", redactedFromVersionId: extra.redactedFromVersionId ?? null, createdBy: admin.userId,
  }).returning();
  await audit({ actorType: "admin", actorUserId: admin.userId, action: "document.created", targetType: "document", targetId: doc.id, details: { title: doc.title, kind: doc.kind } });
  return doc;
}

const AUDITED_FIELDS = ["title", "sectionId", "folderId", "product", "market", "documentDate", "ownerName", "confidentiality",
  "validityStatus", "validUntil", "nextReviewAt", "source", "notes", "tags", "containsPatientData"] as const;

export async function updateDocumentMeta(admin: Pick<AdminCtx, "userId">, docId: string, patch: Partial<DocMeta>) {
  const d = db();
  const before = await d.query.documents.findFirst({ where: eq(schema.documents.id, docId) });
  if (!before) throw new DomainError("not_found");
  const set: Record<string, unknown> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of AUDITED_FIELDS) {
    if (!(k in patch)) continue;
    let v = (patch as Record<string, unknown>)[k];
    if (v === "") v = null;
    if (JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null)) {
      set[k] = v; changes[k] = { from: (before as Record<string, unknown>)[k] ?? null, to: v ?? null };
    }
  }
  if (!Object.keys(set).length) return before;
  set.updatedAt = new Date();
  const [doc] = await d.update(schema.documents).set(set).where(eq(schema.documents.id, docId)).returning();
  await audit({ actorType: "admin", actorUserId: admin.userId, action: "document.metadata_changed", targetType: "document", targetId: docId, details: { changes } });
  return doc;
}

/** Checks storage quota (sum of all stored bytes). */
async function assertQuota(extra: number) {
  const r = await db().select({ total: sql<string>`coalesce(sum(${schema.files.sizeBytes}),0)` }).from(schema.files);
  if (Number(r[0].total) + extra > env().STORAGE_QUOTA_GB * 1024 ** 3) throw new DomainError("quota_exceeded");
}

/**
 * Adds a NEW version (never overwrites). The version is private: it starts in
 * `uploaded` and only an explicit approve + publish makes it reachable.
 */
export async function uploadVersion(admin: Pick<AdminCtx, "userId">, docId: string, filename: string, buf: Buffer,
  opts: { changeSummary?: string; importBatchId?: string } = {}) {
  const d = db();
  const doc = await d.query.documents.findFirst({ where: eq(schema.documents.id, docId) });
  if (!doc) throw new DomainError("not_found");
  if (doc.archivedAt) throw new DomainError("document_archived");
  const val = await validateUpload(filename, buf, env().UPLOAD_MAX_MB * 1024 * 1024);
  if (!val.ok) throw new DomainError("invalid_file", val.errors.join(", "));
  await assertQuota(buf.length);

  const key = newKey("originals", docId);
  await storage().put(key, buf, val.mime!);
  return d.transaction(async (tx) => {
    const [file] = await tx.insert(schema.files).values({
      storageKey: key, purpose: "original", sha256: sha256(buf), sizeBytes: buf.length, mimeType: val.mime!,
      extension: val.ext!, originalFilename: sanitizeFilename(filename),
    }).returning();
    const [{ n }] = await tx.select({ n: max(schema.documentVersions.versionNumber) }).from(schema.documentVersions)
      .where(eq(schema.documentVersions.documentId, docId));
    const [version] = await tx.insert(schema.documentVersions).values({
      documentId: docId, versionNumber: (n ?? 0) + 1, originalFileId: file.id, uploadedBy: admin.userId,
      changeSummary: opts.changeSummary?.slice(0, 1000) || null, importBatchId: opts.importBatchId ?? null,
      conversionReport: { uploadWarnings: val.warnings },
    }).returning();
    await audit({ actorType: "admin", actorUserId: admin.userId, action: "version.uploaded", targetType: "document_version", targetId: version.id,
      details: { documentId: docId, versionNumber: version.versionNumber, sha256: file.sha256, size: file.sizeBytes, warnings: val.warnings } }, tx);
    return { version, file, warnings: val.warnings };
  });
}

async function loadVersion(versionId: string) {
  const v = await db().query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, versionId) });
  if (!v) throw new DomainError("not_found");
  return v;
}

export async function confirmFidelity(admin: Pick<AdminCtx, "userId">, versionId: string) {
  const v = await loadVersion(versionId);
  if (v.fidelityStatus !== "warning") throw new DomainError("nothing_to_confirm");
  await db().update(schema.documentVersions).set({ fidelityConfirmedBy: admin.userId, fidelityConfirmedAt: new Date() })
    .where(eq(schema.documentVersions.id, versionId));
  await audit({ actorType: "admin", actorUserId: admin.userId, action: "version.fidelity_confirmed", targetType: "document_version", targetId: versionId,
    details: { reasons: (v.conversionReport as { fidelityReasons?: string[] })?.fidelityReasons ?? [] } });
}

export async function releaseUnscannedDev(admin: Pick<AdminCtx, "userId">, versionId: string) {
  if (!env().DEV_ALLOW_UNSCANNED_RELEASE || env().APP_ENV === "production") throw new DomainError("not_allowed");
  const v = await loadVersion(versionId);
  if (v.scanStatus !== "not_configured") throw new DomainError("not_applicable");
  await db().update(schema.documentVersions).set({ scanStatus: "released_unscanned_dev", scanDetail: "Released WITHOUT malware scan (development only)" })
    .where(eq(schema.documentVersions.id, versionId));
  await audit({ actorType: "admin", actorUserId: admin.userId, action: "version.released_unscanned_dev", targetType: "document_version", targetId: versionId });
}

export async function approveVersion(admin: Pick<AdminCtx, "userId">, versionId: string, notes?: string) {
  const v = await loadVersion(versionId);
  if (v.status !== "in_review") throw new DomainError("invalid_state", `cannot approve from ${v.status}`);
  await db().update(schema.documentVersions).set({ status: "approved", approvedBy: admin.userId, approvedAt: new Date(), reviewNotes: notes?.slice(0, 2000) || v.reviewNotes })
    .where(eq(schema.documentVersions.id, versionId));
  await audit({ actorType: "admin", actorUserId: admin.userId, action: "version.approved", targetType: "document_version", targetId: versionId });
}

export async function rejectVersion(admin: Pick<AdminCtx, "userId">, versionId: string, notes: string) {
  const v = await loadVersion(versionId);
  if (!["in_review", "approved", "conversion_failed"].includes(v.status)) throw new DomainError("invalid_state");
  await db().update(schema.documentVersions).set({ status: "rejected", reviewNotes: notes.slice(0, 2000) }).where(eq(schema.documentVersions.id, versionId));
  await audit({ actorType: "admin", actorUserId: admin.userId, action: "version.rejected", targetType: "document_version", targetId: versionId, details: { notes } });
}

export interface PublishGrant { subjectType: "recipient" | "group"; subjectId: string; canDownloadWatermarked?: boolean; canDownloadOriginal?: boolean }

/**
 * Conscious publication. The admin has been shown the audience (existing rules)
 * and may add document-level grants for specific recipients/groups.
 * DB trigger `dr_publication_gate` re-checks every control.
 */
export async function publishVersion(admin: Pick<AdminCtx, "userId">, versionId: string, grants: PublishGrant[] = [], audienceSnapshot: string[] = []) {
  const v = await loadVersion(versionId);
  if (v.status !== "approved") throw new DomainError("invalid_state", "version must be approved before publishing");
  try {
    await db().transaction(async (tx) => {
      const prev = await tx.query.documentVersions.findFirst({
        where: and(eq(schema.documentVersions.documentId, v.documentId), eq(schema.documentVersions.status, "published")),
      });
      if (prev) {
        await tx.update(schema.documents).set({ currentPublishedVersionId: null }).where(eq(schema.documents.id, v.documentId));
        await tx.update(schema.documentVersions).set({ status: "superseded" }).where(eq(schema.documentVersions.id, prev.id));
      }
      await tx.update(schema.documentVersions).set({ status: "published", publishedBy: admin.userId, publishedAt: new Date() })
        .where(eq(schema.documentVersions.id, versionId));
      await tx.update(schema.documents).set({ currentPublishedVersionId: versionId, updatedAt: new Date() }).where(eq(schema.documents.id, v.documentId));
      for (const g of grants) {
        await tx.insert(schema.accessRules).values({
          subjectType: g.subjectType, recipientId: g.subjectType === "recipient" ? g.subjectId : null,
          groupId: g.subjectType === "group" ? g.subjectId : null, targetType: "document", documentId: v.documentId,
          effect: "allow", canView: true, canDownloadWatermarked: !!g.canDownloadWatermarked, canDownloadOriginal: !!g.canDownloadOriginal,
          createdBy: admin.userId, note: "granted at publication",
        });
      }
      await audit({ actorType: "admin", actorUserId: admin.userId, action: "version.published", targetType: "document_version", targetId: versionId,
        details: { documentId: v.documentId, supersededVersionId: prev?.id ?? null, grants, audienceRecipientIds: audienceSnapshot } }, tx);
    });
  } catch (e) {
    const m = (e as { cause?: { message?: string }; message: string }).cause?.message ?? (e as Error).message;
    if (m.includes("PUBLICATION_BLOCKED")) throw new DomainError("publication_blocked", m.replace(/^.*PUBLICATION_BLOCKED:\s*/, ""));
    throw e;
  }
}

export async function withdrawVersion(admin: Pick<AdminCtx, "userId">, versionId: string, reason: string) {
  const v = await loadVersion(versionId);
  if (!["published", "superseded"].includes(v.status)) throw new DomainError("invalid_state");
  await db().transaction(async (tx) => {
    if (v.status === "published") await tx.update(schema.documents).set({ currentPublishedVersionId: null }).where(eq(schema.documents.id, v.documentId));
    await tx.update(schema.documentVersions).set({ status: "withdrawn", withdrawnAt: new Date() }).where(eq(schema.documentVersions.id, versionId));
    await audit({ actorType: "admin", actorUserId: admin.userId, action: "version.withdrawn", targetType: "document_version", targetId: versionId, details: { reason } }, tx);
  });
}

export async function setArchived(admin: Pick<AdminCtx, "userId">, docId: string, archived: boolean) {
  await db().update(schema.documents).set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() }).where(eq(schema.documents.id, docId));
  await audit({ actorType: "admin", actorUserId: admin.userId, action: archived ? "document.archived" : "document.unarchived", targetType: "document", targetId: docId });
}

export async function versionsOf(docId: string) {
  return db().select().from(schema.documentVersions).where(eq(schema.documentVersions.documentId, docId)).orderBy(desc(schema.documentVersions.versionNumber));
}

/** Redacted copies whose source is no longer the latest version of the original (warning for admins). */
export async function staleRedactions() {
  const rows = await db().execute<{ id: string; title: string; source_version: number; latest_version: number }>(sql`
    SELECT d.id, d.title, sv.version_number AS source_version,
      (SELECT max(version_number) FROM document_versions WHERE document_id = sv.document_id AND status <> 'rejected') AS latest_version
    FROM documents d JOIN document_versions sv ON sv.id = d.redacted_from_version_id
    WHERE d.kind = 'redacted' AND d.archived_at IS NULL`);
  return rows.rows.filter((r) => Number(r.latest_version) > Number(r.source_version));
}
