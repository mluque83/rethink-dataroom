import "server-only";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, schema } from "./db";
import type { AccessRule, Document, DocumentVersion, Recipient } from "./db/schema";

/**
 * AUTHORISATION MODEL (see docs/ARCHITECTURE.md §Permissions)
 *
 * 1. Default deny: without an applicable `allow` rule nothing is visible.
 * 2. Publication gate: only the document's current PUBLISHED version is
 *    reachable; a superseded version only via an explicit version-level allow.
 *    Drafts, in-review, approved-but-unpublished, withdrawn and archived
 *    documents are never reachable by recipients.
 * 3. Applicable rules = rules of the recipient AND of every group they belong
 *    to, targeting the section, any ancestor folder, the document or the version.
 * 4. effective = ∪(allow caps) − ∪(deny caps). A deny ALWAYS wins, whatever its
 *    subject (individual or group) or specificity. Hence individual restrictions
 *    prevail over inherited group permissions.
 * 5. Downloads additionally require the recipient master switch
 *    (allowWatermarkedDownloads / allowOriginalDownloads, default off).
 *    Original download is a separate capability, off by default.
 * 6. Every capability requires `view`.
 */
export interface Caps { view: boolean; downloadWatermarked: boolean; downloadOriginal: boolean }
export const NO_CAPS: Caps = { view: false, downloadWatermarked: false, downloadOriginal: false };

export interface LibrarySnapshot {
  sections: (typeof schema.sections.$inferSelect)[];
  folders: (typeof schema.folders.$inferSelect)[];
  documents: Document[];
  versions: DocumentVersion[];
}

export interface Subject {
  recipient: Pick<Recipient, "id" | "allowWatermarkedDownloads" | "allowOriginalDownloads">;
  groupIds: string[];
  rules: AccessRule[];
}

function folderAncestors(folderId: string | null, folders: Map<string, { parentId: string | null }>): string[] {
  const out: string[] = [];
  let cur = folderId;
  let guard = 0;
  while (cur && guard++ < 64) {
    out.push(cur);
    cur = folders.get(cur)?.parentId ?? null;
  }
  return out;
}

export function ruleApplies(rule: AccessRule, doc: Document, version: DocumentVersion, ancestors: string[]) {
  switch (rule.targetType) {
    case "section": return rule.sectionId === doc.sectionId;
    case "folder": return !!rule.folderId && ancestors.includes(rule.folderId);
    case "document": return rule.documentId === doc.id;
    case "version": return rule.versionId === version.id;
    default: return false;
  }
}

/** Pure evaluation (unit-tested). `version` must belong to `doc`. */
export function evaluate(subject: Subject, doc: Document, version: DocumentVersion, folderMap: Map<string, { parentId: string | null }>): Caps {
  if (doc.archivedAt || version.documentId !== doc.id) return NO_CAPS;
  const isCurrent = version.status === "published" && doc.currentPublishedVersionId === version.id;
  const isSuperseded = version.status === "superseded";
  if (!isCurrent && !isSuperseded) return NO_CAPS;

  const ancestors = folderAncestors(doc.folderId, folderMap);
  const mine = subject.rules.filter((r) =>
    (r.subjectType === "recipient" && r.recipientId === subject.recipient.id) ||
    (r.subjectType === "group" && !!r.groupId && subject.groupIds.includes(r.groupId)));
  const applicable = mine.filter((r) => ruleApplies(r, doc, version, ancestors));

  const allow = { ...NO_CAPS }, deny = { ...NO_CAPS };
  let explicitVersionAllow = false;
  for (const r of applicable) {
    const t = r.effect === "allow" ? allow : deny;
    if (r.canView) t.view = true;
    if (r.canDownloadWatermarked) t.downloadWatermarked = true;
    if (r.canDownloadOriginal) t.downloadOriginal = true;
    if (r.effect === "allow" && r.targetType === "version") explicitVersionAllow = true;
  }
  // superseded versions need an explicit version-level allow
  if (isSuperseded && !explicitVersionAllow) return NO_CAPS;

  const view = allow.view && !deny.view;
  if (!view) return NO_CAPS;
  return {
    view,
    downloadWatermarked: allow.downloadWatermarked && !deny.downloadWatermarked && subject.recipient.allowWatermarkedDownloads,
    downloadOriginal: allow.downloadOriginal && !deny.downloadOriginal && subject.recipient.allowOriginalDownloads,
  };
}

/* ------------------------------ loaders ------------------------------ */

export async function loadSubject(recipientId: string): Promise<Subject | null> {
  const d = db();
  const recipient = await d.query.recipients.findFirst({ where: eq(schema.recipients.id, recipientId) });
  if (!recipient) return null;
  const memberships = await d.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers)
    .where(eq(schema.groupMembers.recipientId, recipientId));
  const groupIds = memberships.map((m) => m.groupId);
  const rules = await d.select().from(schema.accessRules).where(
    groupIds.length
      ? or(eq(schema.accessRules.recipientId, recipientId), inArray(schema.accessRules.groupId, groupIds))
      : eq(schema.accessRules.recipientId, recipientId));
  return { recipient, groupIds, rules };
}

export async function loadLibrary(): Promise<LibrarySnapshot> {
  const d = db();
  const [sections, folders, documents, versions] = await Promise.all([
    d.select().from(schema.sections).orderBy(schema.sections.sortOrder),
    d.select().from(schema.folders).orderBy(schema.folders.sortOrder),
    d.select().from(schema.documents).where(isNull(schema.documents.archivedAt)),
    d.select().from(schema.documentVersions).where(inArray(schema.documentVersions.status, ["published", "superseded"])),
  ]);
  return { sections, folders, documents, versions };
}

export interface VisibleDoc {
  doc: Document;
  version: DocumentVersion;
  caps: Caps;
  /** superseded versions explicitly granted */
  olderVersions: { version: DocumentVersion; caps: Caps }[];
}

/** Everything a recipient may see. The ONLY source for recipient-facing listings, search and exports. */
export function visibleDocuments(subject: Subject, lib: LibrarySnapshot): VisibleDoc[] {
  const folderMap = new Map(lib.folders.map((f) => [f.id, { parentId: f.parentId }]));
  const byDoc = new Map<string, DocumentVersion[]>();
  for (const v of lib.versions) byDoc.set(v.documentId, [...(byDoc.get(v.documentId) ?? []), v]);
  const out: VisibleDoc[] = [];
  for (const doc of lib.documents) {
    const vs = byDoc.get(doc.id) ?? [];
    const current = vs.find((v) => v.id === doc.currentPublishedVersionId && v.status === "published");
    const older = vs.filter((v) => v.status === "superseded")
      .map((v) => ({ version: v, caps: evaluate(subject, doc, v, folderMap) }))
      .filter((x) => x.caps.view);
    if (current) {
      const caps = evaluate(subject, doc, current, folderMap);
      if (caps.view) out.push({ doc, version: current, caps, olderVersions: older });
      else if (older.length) out.push({ doc, version: older[0].version, caps: older[0].caps, olderVersions: older.slice(1) });
    } else if (older.length) {
      out.push({ doc, version: older[0].version, caps: older[0].caps, olderVersions: older.slice(1) });
    }
  }
  return out;
}

/**
 * Per-request authorisation for a specific version. Returns null when not
 * visible; callers must answer with a generic 404 so that hidden documents are
 * indistinguishable from non-existent ones.
 */
export async function authorizeVersion(recipientId: string, documentId: string, versionId: string) {
  if (!isUuid(documentId) || !isUuid(versionId)) return null;
  const subject = await loadSubject(recipientId);
  if (!subject) return null;
  const d = db();
  const doc = await d.query.documents.findFirst({ where: and(eq(schema.documents.id, documentId), isNull(schema.documents.archivedAt)) });
  if (!doc) return null;
  const version = await d.query.documentVersions.findFirst({
    where: and(eq(schema.documentVersions.id, versionId), eq(schema.documentVersions.documentId, documentId)),
  });
  if (!version) return null;
  const folders = await d.select({ id: schema.folders.id, parentId: schema.folders.parentId }).from(schema.folders);
  const caps = evaluate(subject, doc, version, new Map(folders.map((f) => [f.id, { parentId: f.parentId }])));
  if (!caps.view) return null;
  return { doc, version, caps, subject };
}

export const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

/** Who would see `doc` if `version` were its current published version (shown before publishing). */
export async function audienceIfPublished(documentId: string) {
  const d = db();
  const doc = await d.query.documents.findFirst({ where: eq(schema.documents.id, documentId) });
  if (!doc) return [];
  const recips = await d.select().from(schema.recipients).where(inArray(schema.recipients.status, ["draft", "invited", "active"]));
  const folders = await d.select({ id: schema.folders.id, parentId: schema.folders.parentId }).from(schema.folders);
  const fm = new Map(folders.map((f) => [f.id, { parentId: f.parentId }]));
  const fakeVersionId = "00000000-0000-4000-8000-000000000000";
  const hypotheticalDoc = { ...doc, currentPublishedVersionId: fakeVersionId };
  const hypotheticalVersion = { id: fakeVersionId, documentId: doc.id, status: "published" } as DocumentVersion;
  const out: { recipient: Recipient; caps: Caps }[] = [];
  for (const r of recips) {
    const s = await loadSubject(r.id);
    if (!s) continue;
    const caps = evaluate(s, hypotheticalDoc, hypotheticalVersion, fm);
    if (caps.view) out.push({ recipient: r, caps });
  }
  return out;
}
