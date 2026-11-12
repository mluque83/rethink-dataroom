import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema, type Tx } from "./db";
import { env } from "./env";
import { audit } from "./audit";
import { newAccessCode, newToken, normalizeEmail, sha256Hex, EMAIL_RE } from "./security";
import { revokeAllSessions } from "./recipient-state";
import { getSetting } from "./settings";
import { sendMail } from "./email";
import { invitationMail } from "./email/templates";
import { DomainError } from "./documents/library";

export interface RecipientInput {
  email: string; displayName: string; organizationId?: string | null; roleTitle?: string | null;
  ndaTextId: string; accessStartsAt?: Date | null; accessExpiresAt?: Date | null;
  allowWatermarkedDownloads?: boolean; allowOriginalDownloads?: boolean; qaEnabled?: boolean;
  sessionMaxHours?: number; profileId?: string | null; locale?: "es" | "en"; isDemo?: boolean; groupIds?: string[];
}

export interface ProfileDefinition {
  sections: { code: string; view: boolean; downloadWatermarked?: boolean; downloadOriginal?: boolean }[];
  qaEnabled?: boolean; allowWatermarkedDownloads?: boolean; allowOriginalDownloads?: boolean;
}

export async function createRecipient(adminId: string, input: RecipientInput) {
  const email = normalizeEmail(input.email);
  if (!EMAIL_RE.test(email)) throw new DomainError("invalid_email");
  const d = db();
  if (await d.query.user.findFirst({ where: eq(schema.user.email, email) })) throw new DomainError("email_in_use");
  return d.transaction(async (tx) => {
    const userId = randomUUID();
    await tx.insert(schema.user).values({ id: userId, name: input.displayName.slice(0, 200), email, role: "recipient", emailVerified: false });
    const [r] = await tx.insert(schema.recipients).values({
      userId, email, displayName: input.displayName.trim().slice(0, 200), organizationId: input.organizationId || null,
      roleTitle: input.roleTitle || null, ndaTextId: input.ndaTextId, accessStartsAt: input.accessStartsAt ?? null,
      accessExpiresAt: input.accessExpiresAt ?? null, allowWatermarkedDownloads: !!input.allowWatermarkedDownloads,
      allowOriginalDownloads: !!input.allowOriginalDownloads, qaEnabled: !!input.qaEnabled,
      sessionMaxHours: input.sessionMaxHours ?? 12, profileId: input.profileId || null, locale: input.locale ?? "es",
      isDemo: !!input.isDemo, accessCode: newAccessCode(), createdBy: adminId,
    }).returning();
    for (const g of input.groupIds ?? []) await tx.insert(schema.groupMembers).values({ groupId: g, recipientId: r.id });
    if (input.profileId) await applyProfile(tx, adminId, r.id, input.profileId);
    await audit({ actorType: "admin", actorUserId: adminId, action: "recipient.created", targetType: "recipient", targetId: r.id,
      details: { email, profileId: input.profileId ?? null, groups: input.groupIds ?? [] } }, tx);
    return r;
  });
}

/** Profiles are templates: they are COPIED into individual rules that can then be edited. */
export async function applyProfile(tx: Tx, adminId: string, recipientId: string, profileId: string) {
  const p = await tx.query.accessProfiles.findFirst({ where: eq(schema.accessProfiles.id, profileId) });
  if (!p) throw new DomainError("profile_not_found");
  const def = p.definition as ProfileDefinition;
  const secs = await tx.select().from(schema.sections);
  for (const s of def.sections.filter((x) => x.view)) {
    const sec = secs.find((x) => x.code === s.code);
    if (!sec) continue;
    await tx.insert(schema.accessRules).values({
      subjectType: "recipient", recipientId, targetType: "section", sectionId: sec.id, effect: "allow",
      canView: true, canDownloadWatermarked: !!s.downloadWatermarked, canDownloadOriginal: !!s.downloadOriginal,
      createdBy: adminId, note: `from profile: ${p.name}`,
    });
  }
  await tx.update(schema.recipients).set({
    qaEnabled: !!def.qaEnabled, allowWatermarkedDownloads: !!def.allowWatermarkedDownloads,
    allowOriginalDownloads: !!def.allowOriginalDownloads, profileId,
  }).where(eq(schema.recipients.id, recipientId));
  await audit({ actorType: "admin", actorUserId: adminId, action: "recipient.profile_applied", targetType: "recipient", targetId: recipientId, details: { profile: p.name } }, tx);
}

const RECIPIENT_FIELDS = ["displayName", "organizationId", "roleTitle", "ndaTextId", "accessStartsAt", "accessExpiresAt",
  "allowWatermarkedDownloads", "allowOriginalDownloads", "qaEnabled", "sessionMaxHours", "locale", "internalNotes"] as const;

export async function updateRecipient(adminId: string, id: string, patch: Partial<Record<(typeof RECIPIENT_FIELDS)[number], unknown>>) {
  const d = db();
  const before = await d.query.recipients.findFirst({ where: eq(schema.recipients.id, id) });
  if (!before) throw new DomainError("not_found");
  const set: Record<string, unknown> = {}, changes: Record<string, unknown> = {};
  for (const k of RECIPIENT_FIELDS) if (k in patch) {
    const v = patch[k] === "" ? null : patch[k];
    if (JSON.stringify((before as Record<string, unknown>)[k] ?? null) !== JSON.stringify(v ?? null)) { set[k] = v; changes[k] = { from: (before as Record<string, unknown>)[k] ?? null, to: v ?? null }; }
  }
  if (!Object.keys(set).length) return before;
  set.updatedAt = new Date();
  await d.update(schema.recipients).set(set).where(eq(schema.recipients.id, id));
  await audit({ actorType: "admin", actorUserId: adminId, action: "recipient.updated", targetType: "recipient", targetId: id, details: { changes } });
}

export async function setGroupMembership(adminId: string, recipientId: string, groupIds: string[]) {
  await db().transaction(async (tx) => {
    await tx.delete(schema.groupMembers).where(eq(schema.groupMembers.recipientId, recipientId));
    for (const g of groupIds) await tx.insert(schema.groupMembers).values({ groupId: g, recipientId });
    await audit({ actorType: "admin", actorUserId: adminId, action: "recipient.groups_changed", targetType: "recipient", targetId: recipientId, details: { groupIds } }, tx);
  });
}

export interface RuleInput {
  subjectType: "recipient" | "group"; subjectId: string; targetType: "section" | "folder" | "document" | "version"; targetId: string;
  effect: "allow" | "deny"; canView: boolean; canDownloadWatermarked: boolean; canDownloadOriginal: boolean; note?: string;
}

export async function addRule(adminId: string, r: RuleInput) {
  const [row] = await db().insert(schema.accessRules).values({
    subjectType: r.subjectType, recipientId: r.subjectType === "recipient" ? r.subjectId : null, groupId: r.subjectType === "group" ? r.subjectId : null,
    targetType: r.targetType, sectionId: r.targetType === "section" ? r.targetId : null, folderId: r.targetType === "folder" ? r.targetId : null,
    documentId: r.targetType === "document" ? r.targetId : null, versionId: r.targetType === "version" ? r.targetId : null,
    effect: r.effect, canView: r.canView, canDownloadWatermarked: r.canDownloadWatermarked, canDownloadOriginal: r.canDownloadOriginal,
    note: r.note?.slice(0, 300) || null, createdBy: adminId,
  }).returning();
  await audit({ actorType: "admin", actorUserId: adminId, action: "permission.rule_added", targetType: r.subjectType, targetId: r.subjectId, details: { rule: row } });
  return row;
}

export async function removeRule(adminId: string, ruleId: string) {
  const [row] = await db().delete(schema.accessRules).where(eq(schema.accessRules.id, ruleId)).returning();
  if (row) await audit({ actorType: "admin", actorUserId: adminId, action: "permission.rule_removed", targetType: row.subjectType, targetId: row.recipientId ?? row.groupId ?? "", details: { rule: row } });
}

/* ------------------------------ invitations ------------------------------ */

/**
 * Issues a fresh invitation (previous pending ones are superseded, so older
 * links stop working). The plain token exists only in the returned URL and in
 * the e-mail; the DB stores its SHA-256. The token travels in the URL fragment
 * (#t=...), which browsers never send to servers, proxies or logs.
 */
export async function issueInvitation(adminId: string, recipientId: string, opts: { send: boolean }) {
  const d = db();
  const r = await d.query.recipients.findFirst({ where: eq(schema.recipients.id, recipientId) });
  if (!r) throw new DomainError("not_found");
  if (r.status === "revoked" || r.status === "suspended") throw new DomainError("recipient_revoked");
  const token = newToken();
  const { expiryDays } = await getSetting("invitations");
  const expiresAt = new Date(Date.now() + expiryDays * 86400_000);
  const inv = await d.transaction(async (tx) => {
    await tx.update(schema.invitations).set({ status: "superseded" })
      .where(and(eq(schema.invitations.recipientId, recipientId), inArray(schema.invitations.status, ["created", "sent"])));
    const [inv] = await tx.insert(schema.invitations).values({ recipientId, tokenHash: sha256Hex(token), expiresAt, createdBy: adminId }).returning();
    if (r.status === "draft") await tx.update(schema.recipients).set({ status: "invited", updatedAt: new Date() }).where(eq(schema.recipients.id, recipientId));
    await audit({ actorType: "admin", actorUserId: adminId, action: "invitation.issued", targetType: "recipient", targetId: recipientId, details: { invitationId: inv.id, expiresAt, send: opts.send } }, tx);
    return inv;
  });
  const url = `${env().APP_URL}/invite#t=${token}`;
  if (opts.send) {
    const fmt = new Intl.DateTimeFormat(r.locale === "en" ? "en-GB" : "es-ES", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", timeZone: env().APP_TIMEZONE, timeZoneName: "short" });
    const m = invitationMail(r.locale === "en" ? "en" : "es", { name: r.displayName, url, expiresAt: fmt.format(expiresAt) });
    await sendMail({ to: r.email, ...m });
    await d.update(schema.invitations).set({ status: "sent", sentAt: new Date(), sendCount: 1 }).where(eq(schema.invitations.id, inv.id));
    await audit({ actorType: "admin", actorUserId: adminId, action: "invitation.sent", targetType: "recipient", targetId: recipientId, details: { invitationId: inv.id, provider: env().EMAIL_PROVIDER } });
  }
  return { invitation: inv, url };
}

export async function revokeRecipient(adminId: string, recipientId: string, reason: string) {
  const d = db();
  const r = await d.query.recipients.findFirst({ where: eq(schema.recipients.id, recipientId) });
  if (!r) throw new DomainError("not_found");
  await d.transaction(async (tx) => {
    await tx.update(schema.recipients).set({ status: "revoked", revokedAt: new Date(), revokedReason: reason.slice(0, 500), updatedAt: new Date() })
      .where(eq(schema.recipients.id, recipientId));
    await tx.update(schema.invitations).set({ status: "revoked", revokedAt: new Date() })
      .where(and(eq(schema.invitations.recipientId, recipientId), inArray(schema.invitations.status, ["created", "sent", "verified"])));
    await tx.delete(schema.session).where(eq(schema.session.userId, r.userId));
    await audit({ actorType: "admin", actorUserId: adminId, action: "recipient.revoked", targetType: "recipient", targetId: recipientId, details: { reason } }, tx);
  });
  await revokeAllSessions(r.userId);
}

export async function reinstateRecipient(adminId: string, recipientId: string) {
  await db().update(schema.recipients).set({ status: "invited", revokedAt: null, revokedReason: null, updatedAt: new Date() }).where(eq(schema.recipients.id, recipientId));
  await audit({ actorType: "admin", actorUserId: adminId, action: "recipient.reinstated", targetType: "recipient", targetId: recipientId });
}

export async function closeSessions(adminId: string, recipientId: string) {
  const r = await db().query.recipients.findFirst({ where: eq(schema.recipients.id, recipientId) });
  if (!r) return;
  await revokeAllSessions(r.userId);
  await audit({ actorType: "admin", actorUserId: adminId, action: "recipient.sessions_closed", targetType: "recipient", targetId: recipientId });
}
