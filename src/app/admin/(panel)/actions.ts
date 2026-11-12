"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/server/authz";
import { auth } from "@/server/auth";
import { db, schema } from "@/server/db";
import { audit } from "@/server/audit";
import {
  createDocument, updateDocumentMeta, uploadVersion, confirmFidelity, releaseUnscannedDev, approveVersion, rejectVersion,
  publishVersion, withdrawVersion, setArchived, DomainError, type PublishGrant,
} from "@/server/documents/library";
import { enqueueProcessing } from "@/server/jobs";
import { verifyRedaction, attestRedaction } from "@/server/documents/redaction";
import {
  createRecipient, updateRecipient, setGroupMembership, addRule, removeRule, issueInvitation, revokeRecipient, reinstateRecipient,
  closeSessions, applyProfile,
} from "@/server/recipients";
import { audienceIfPublished } from "@/server/permissions";
import { setSetting, type SettingKey } from "@/server/settings";
import { adminUpdateQuestion, addInternalNote, saveAnswerDraft, publishAnswer, shareQuestionWithGroup } from "@/server/qa";
import { applyRetention } from "@/server/retention";
import { safeRedirectPath } from "@/server/security";

const s = (fd: FormData, k: string) => { const v = fd.get(k); return typeof v === "string" ? v.trim() : ""; };
const b = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const dt = (v: string) => (v ? new Date(v) : null);

function back(path: string, q: Record<string, string>): never {
  const u = new URLSearchParams(q).toString();
  redirect(`${safeRedirectPath(path, "/admin")}${path.includes("?") ? "&" : "?"}${u}`);
}
async function run(path: string, fn: () => Promise<unknown>, okMsg = "ok"): Promise<never> {
  try { await fn(); } catch (e) {
    if (e instanceof DomainError) back(path, { err: `${e.code}${e.message && e.message !== e.code ? `: ${e.message}` : ""}`.slice(0, 300) });
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    console.error("[admin action]", (e as Error).message);
    back(path, { err: "unexpected_error" });
  }
  revalidatePath(path.split("?")[0]);
  back(path, { msg: okMsg });
}

/* ------------------------------ library ------------------------------ */

function metaFrom(fd: FormData) {
  return {
    title: s(fd, "title"), sectionId: s(fd, "sectionId"), folderId: s(fd, "folderId") || null, product: s(fd, "product") || null,
    market: s(fd, "market") || null, documentDate: s(fd, "documentDate") || null, ownerName: s(fd, "ownerName") || null,
    confidentiality: s(fd, "confidentiality") || "confidential", validityStatus: s(fd, "validityStatus") || "pending_verification",
    validUntil: s(fd, "validUntil") || null, nextReviewAt: s(fd, "nextReviewAt") || null, source: s(fd, "source") || null,
    notes: s(fd, "notes") || null, tags: s(fd, "tags").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 20),
    containsPatientData: b(fd, "containsPatientData"),
  };
}

export async function createDocumentWithFileAction(fd: FormData) {
  const admin = await requireAdmin();
  const file = fd.get("file") as File | null;
  let id = "";
  await run("/admin/library", async () => {
    const doc = await createDocument(admin, metaFrom(fd));
    id = doc.id;
    if (file && file.size > 0) {
      const { version } = await uploadVersion(admin, doc.id, file.name, Buffer.from(await file.arrayBuffer()), { changeSummary: s(fd, "changeSummary") });
      await enqueueProcessing(version.id);
    }
    redirect(`/admin/documents/${id}?msg=created`);
  });
}

/** Batch upload: one PRIVATE document per file, all in review state; nothing is published. */
export async function batchUploadAction(fd: FormData) {
  const admin = await requireAdmin();
  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 50);
  const sectionId = s(fd, "sectionId");
  const errors: string[] = [];
  for (const f of files) {
    try {
      const doc = await createDocument(admin, { title: f.name.replace(/\.[^.]+$/, "").slice(0, 300), sectionId, folderId: s(fd, "folderId") || null, source: "carga por lotes" });
      const { version } = await uploadVersion(admin, doc.id, f.name, Buffer.from(await f.arrayBuffer()));
      await enqueueProcessing(version.id);
    } catch (e) { errors.push(`${f.name.slice(0, 60)}: ${(e as DomainError).code ?? "error"}`); }
  }
  back("/admin/library", errors.length ? { err: `Algunos archivos no se cargaron — ${errors.join("; ").slice(0, 400)}` } : { msg: `${files.length} archivos cargados en revisión` });
}

export async function updateDocumentAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "documentId");
  await run(`/admin/documents/${id}`, () => updateDocumentMeta(admin, id, metaFrom(fd)), "saved");
}

export async function uploadVersionAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "documentId");
  const file = fd.get("file") as File;
  await run(`/admin/documents/${id}`, async () => {
    if (!file || !file.size) throw new DomainError("no_file");
    const { version } = await uploadVersion(admin, id, file.name, Buffer.from(await file.arrayBuffer()), { changeSummary: s(fd, "changeSummary") });
    await enqueueProcessing(version.id);
  }, "version_uploaded");
}

export async function versionAction(fd: FormData) {
  const admin = await requireAdmin();
  const docId = s(fd, "documentId"), versionId = s(fd, "versionId"), op = s(fd, "op");
  await run(`/admin/documents/${docId}`, async () => {
    switch (op) {
      case "confirm_fidelity": return confirmFidelity(admin, versionId);
      case "release_unscanned": return releaseUnscannedDev(admin, versionId);
      case "approve": return approveVersion(admin, versionId, s(fd, "notes"));
      case "reject": return rejectVersion(admin, versionId, s(fd, "notes") || "rechazado");
      case "withdraw": return withdrawVersion(admin, versionId, s(fd, "notes") || "retirado");
      case "reprocess": {
        await db().update(schema.documentVersions).set({ status: "uploaded" }).where(eq(schema.documentVersions.id, versionId));
        return enqueueProcessing(versionId);
      }
      default: throw new DomainError("unknown_op");
    }
  }, op);
}

export async function publishAction(fd: FormData) {
  const admin = await requireAdmin();
  const docId = s(fd, "documentId"), versionId = s(fd, "versionId");
  if (!b(fd, "confirmAudience")) back(`/admin/documents/${docId}`, { err: "Debes confirmar la audiencia antes de publicar" });
  const grants: PublishGrant[] = [
    ...fd.getAll("grantRecipient").map((x) => ({ subjectType: "recipient" as const, subjectId: String(x), canDownloadWatermarked: b(fd, "grantDownloadWm") })),
    ...fd.getAll("grantGroup").map((x) => ({ subjectType: "group" as const, subjectId: String(x), canDownloadWatermarked: b(fd, "grantDownloadWm") })),
  ];
  await run(`/admin/documents/${docId}`, async () => {
    const audience = await audienceIfPublished(docId);
    await publishVersion(admin, versionId, grants, audience.map((a) => a.recipient.id));
  }, "published");
}

export async function archiveAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "documentId");
  await run(`/admin/documents/${id}`, () => setArchived(admin, id, s(fd, "archived") === "1"), "saved");
}

export async function createRedactedCopyAction(fd: FormData) {
  const admin = await requireAdmin();
  const sourceVersionId = s(fd, "sourceVersionId"), docId = s(fd, "documentId");
  const file = fd.get("file") as File;
  await run(`/admin/documents/${docId}`, async () => {
    const src = await db().query.documents.findFirst({ where: eq(schema.documents.id, docId) });
    if (!src || !file?.size) throw new DomainError("invalid");
    const copy = await createDocument(admin, { title: `${src.title} [EXPURGADO]`, sectionId: src.sectionId, folderId: src.folderId, confidentiality: src.confidentiality, source: `Copia expurgada de ${src.ref}`, notes: s(fd, "notes") },
      { kind: "redacted", redactedFromVersionId: sourceVersionId });
    const { version } = await uploadVersion(admin, copy.id, file.name, Buffer.from(await file.arrayBuffer()), { changeSummary: "copia expurgada" });
    await enqueueProcessing(version.id);
    redirect(`/admin/documents/${copy.id}?msg=redacted_copy_created`);
  });
}

export async function verifyRedactionAction(fd: FormData) {
  const admin = await requireAdmin();
  const docId = s(fd, "documentId");
  // terms are used in memory only and never stored or logged
  const terms = s(fd, "terms").split("\n");
  await run(`/admin/documents/${docId}`, () => verifyRedaction(admin.userId, s(fd, "versionId"), terms), "redaction_checked");
}

export async function attestRedactionAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(`/admin/documents/${s(fd, "documentId")}`, () => attestRedaction(admin.userId, s(fd, "checkId"), s(fd, "attestation")), "attested");
}

export async function checklistAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "itemId");
  await run("/admin/checklist", async () => {
    const status = s(fd, "status");
    if (["pending", "not_applicable"].includes(status) && !s(fd, "justification")) throw new DomainError("justification_required");
    await db().update(schema.checklistItems).set({ status, justification: s(fd, "justification") || null, documentId: s(fd, "documentId") || null, updatedBy: admin.userId, updatedAt: new Date() })
      .where(eq(schema.checklistItems.id, id));
    await audit({ actorType: "admin", actorUserId: admin.userId, action: "checklist.updated", targetType: "checklist_item", targetId: id, details: { status } });
  }, "saved");
}

export async function sectionAction(fd: FormData) {
  const admin = await requireAdmin();
  await run("/admin/library", async () => {
    const op = s(fd, "op");
    if (op === "rename") {
      await db().update(schema.sections).set({ nameEs: s(fd, "nameEs"), nameEn: s(fd, "nameEn") }).where(eq(schema.sections.id, s(fd, "sectionId")));
    } else if (op === "add_section") {
      await db().insert(schema.sections).values({ code: s(fd, "code"), nameEs: s(fd, "nameEs"), nameEn: s(fd, "nameEn") || s(fd, "nameEs"), sortOrder: 100 });
    } else if (op === "add_folder") {
      await db().insert(schema.folders).values({ sectionId: s(fd, "sectionId"), parentId: s(fd, "parentId") || null, name: s(fd, "name") });
    } else if (op === "add_item") {
      await db().insert(schema.checklistItems).values({ sectionId: s(fd, "sectionId"), title: s(fd, "title"), sortOrder: 99 });
    }
    await audit({ actorType: "admin", actorUserId: admin.userId, action: `structure.${op}`, details: Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith("$")).map(([k, v]) => [k, String(v)])) });
  }, "saved");
}

/* ----------------------------- recipients ----------------------------- */

export async function createRecipientAction(fd: FormData) {
  const admin = await requireAdmin();
  let id = "";
  await run("/admin/recipients/new", async () => {
    const r = await createRecipient(admin.userId, {
      email: s(fd, "email"), displayName: s(fd, "displayName"), organizationId: s(fd, "organizationId") || null, roleTitle: s(fd, "roleTitle") || null,
      ndaTextId: s(fd, "ndaTextId"), accessStartsAt: dt(s(fd, "accessStartsAt")), accessExpiresAt: dt(s(fd, "accessExpiresAt")),
      allowWatermarkedDownloads: b(fd, "allowWatermarkedDownloads"), allowOriginalDownloads: b(fd, "allowOriginalDownloads"),
      qaEnabled: b(fd, "qaEnabled"), sessionMaxHours: Number(s(fd, "sessionMaxHours") || 12), profileId: s(fd, "profileId") || null,
      locale: s(fd, "locale") === "en" ? "en" : "es", groupIds: fd.getAll("groupIds").map(String),
    });
    id = r.id;
    redirect(`/admin/recipients/${id}?msg=created`);
  });
}

export async function updateRecipientAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "recipientId");
  await run(`/admin/recipients/${id}`, async () => {
    await updateRecipient(admin.userId, id, {
      displayName: s(fd, "displayName"), organizationId: s(fd, "organizationId") || null, roleTitle: s(fd, "roleTitle"), ndaTextId: s(fd, "ndaTextId"),
      accessStartsAt: dt(s(fd, "accessStartsAt")), accessExpiresAt: dt(s(fd, "accessExpiresAt")),
      allowWatermarkedDownloads: b(fd, "allowWatermarkedDownloads"), allowOriginalDownloads: b(fd, "allowOriginalDownloads"),
      qaEnabled: b(fd, "qaEnabled"), sessionMaxHours: Number(s(fd, "sessionMaxHours") || 12), locale: s(fd, "locale") === "en" ? "en" : "es",
      internalNotes: s(fd, "internalNotes"),
    });
    await setGroupMembership(admin.userId, id, fd.getAll("groupIds").map(String));
  }, "saved");
}

export async function ruleAction(fd: FormData) {
  const admin = await requireAdmin();
  const path = s(fd, "returnTo") || "/admin/recipients";
  await run(path, async () => {
    if (s(fd, "op") === "remove") return removeRule(admin.userId, s(fd, "ruleId"));
    const [targetType, targetId] = s(fd, "target").split(":");
    const effect = s(fd, "effect") === "deny" ? "deny" : "allow";
    await addRule(admin.userId, {
      subjectType: s(fd, "subjectType") === "group" ? "group" : "recipient", subjectId: s(fd, "subjectId"),
      targetType: targetType as "section" | "folder" | "document" | "version", targetId, effect,
      canView: effect === "deny" ? b(fd, "canView") : true, canDownloadWatermarked: b(fd, "canDownloadWatermarked"),
      canDownloadOriginal: b(fd, "canDownloadOriginal"), note: s(fd, "note"),
    });
  }, "permissions_saved");
}

export async function applyProfileAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "recipientId");
  await run(`/admin/recipients/${id}`, () => db().transaction((tx) => applyProfile(tx, admin.userId, id, s(fd, "profileId"))), "profile_applied");
}

export async function inviteAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "recipientId");
  if (!b(fd, "confirmSummary")) back(`/admin/recipients/${id}`, { err: "Confirma que has revisado el resumen previo" });
  let url = "";
  await run(`/admin/recipients/${id}`, async () => {
    const r = await issueInvitation(admin.userId, id, { send: s(fd, "mode") === "send" });
    url = r.url;
    // the link is shown ONCE to the admin (for manual delivery); it is not stored in clear anywhere
    const { cookies } = await import("next/headers");
    (await cookies()).set("rmdr_inv_once", url, { httpOnly: true, sameSite: "strict", path: `/admin/recipients/${id}`, maxAge: 120, secure: process.env.APP_ENV === "production" });
  }, s(fd, "mode") === "send" ? "invitation_sent" : "invitation_created");
}

export async function recipientStateAction(fd: FormData) {
  const admin = await requireAdmin();
  const id = s(fd, "recipientId");
  await run(`/admin/recipients/${id}`, async () => {
    const op = s(fd, "op");
    if (op === "revoke") return revokeRecipient(admin.userId, id, s(fd, "reason") || "revocado por administrador");
    if (op === "reinstate") return reinstateRecipient(admin.userId, id);
    if (op === "close_sessions") return closeSessions(admin.userId, id);
  }, s(fd, "op"));
}

export async function groupAction(fd: FormData) {
  const admin = await requireAdmin();
  await run("/admin/groups", async () => {
    const [g] = await db().insert(schema.groups).values({ name: s(fd, "name"), description: s(fd, "description") || null }).returning();
    await audit({ actorType: "admin", actorUserId: admin.userId, action: "group.created", targetType: "group", targetId: g.id });
  }, "saved");
}

export async function organizationAction(fd: FormData) {
  const admin = await requireAdmin();
  await run(s(fd, "returnTo") || "/admin/recipients", async () => {
    const [o] = await db().insert(schema.organizations).values({ name: s(fd, "name"), kind: s(fd, "kind") || "investor" }).returning();
    await audit({ actorType: "admin", actorUserId: admin.userId, action: "organization.created", targetType: "organization", targetId: o.id });
  }, "saved");
}

export async function profileAction(fd: FormData) {
  const admin = await requireAdmin();
  await run("/admin/profiles", async () => {
    const codes = fd.getAll("view").map(String);
    const dl = new Set(fd.getAll("dl").map(String));
    const definition = { sections: codes.map((code) => ({ code, view: true, downloadWatermarked: dl.has(code) })), qaEnabled: b(fd, "qaEnabled"), allowWatermarkedDownloads: b(fd, "allowWatermarkedDownloads") };
    const id = s(fd, "profileId");
    if (id) await db().update(schema.accessProfiles).set({ name: s(fd, "name"), description: s(fd, "description"), definition, updatedAt: new Date() }).where(eq(schema.accessProfiles.id, id));
    else await db().insert(schema.accessProfiles).values({ name: s(fd, "name"), description: s(fd, "description"), definition });
    await audit({ actorType: "admin", actorUserId: admin.userId, action: "profile.saved", targetType: "profile", targetId: id || "new", details: { definition } });
  }, "saved");
}

/* -------------------------------- legal -------------------------------- */

export async function legalAction(fd: FormData) {
  const admin = await requireAdmin();
  await run("/admin/legal", async () => {
    const op = s(fd, "op"), id = s(fd, "versionId");
    if (op === "new_version") {
      await db().insert(schema.legalTextVersions).values({
        legalTextId: s(fd, "legalTextId"), versionLabel: s(fd, "versionLabel"), language: s(fd, "language") || "es", body: String(fd.get("body") ?? ""),
        bodySha256: "computed-by-trigger", requiresReacceptance: b(fd, "requiresReacceptance"), changeSummary: s(fd, "changeSummary"), createdBy: admin.userId,
      });
    } else if (op === "mark_reviewed") {
      await db().update(schema.legalTextVersions).set({ legalReviewStatus: "legal_reviewed" }).where(eq(schema.legalTextVersions.id, id));
    } else if (op === "activate") {
      const v = await db().query.legalTextVersions.findFirst({ where: eq(schema.legalTextVersions.id, id) });
      if (!v || v.status !== "draft") throw new DomainError("invalid_state");
      await db().transaction(async (tx) => {
        await tx.execute(sql`UPDATE legal_text_versions SET status = 'retired' WHERE legal_text_id = ${v.legalTextId} AND status = 'active'`);
        await tx.update(schema.legalTextVersions).set({ status: "active", activatedAt: new Date(), activatedBy: admin.userId }).where(eq(schema.legalTextVersions.id, id));
      });
    } else if (op === "delete_draft") {
      await db().delete(schema.legalTextVersions).where(eq(schema.legalTextVersions.id, id));
    }
    await audit({ actorType: "admin", actorUserId: admin.userId, action: `legal.${op}`, targetType: "legal_text_version", targetId: id || s(fd, "legalTextId") });
  }, "saved");
}

/* --------------------------------- Q&A --------------------------------- */

export async function qaAction(fd: FormData) {
  const admin = await requireAdmin();
  const qid = s(fd, "questionId");
  await run(`/admin/qa/${qid}`, async () => {
    const op = s(fd, "op");
    if (op === "update") return adminUpdateQuestion(admin.userId, qid, { status: s(fd, "status"), assigneeUserId: s(fd, "assigneeUserId") || null });
    if (op === "note") return addInternalNote(admin.userId, qid, s(fd, "body"));
    if (op === "draft") return saveAnswerDraft(admin.userId, qid, s(fd, "body"), fd.getAll("attachments").map(String));
    if (op === "publish") return publishAnswer(admin.userId, s(fd, "answerId"));
    if (op === "share") return shareQuestionWithGroup(admin.userId, qid, s(fd, "groupId") || null);
  }, "saved");
}

/* ------------------------------ settings ------------------------------ */

export async function settingsAction(fd: FormData) {
  const admin = await requireAdmin();
  const key = s(fd, "key") as SettingKey;
  const n = (k: string) => Number(s(fd, k));
  const values: Record<string, unknown> = {
    watermark: { opacity: n("opacity") },
    tracking: { detailedMetricsEnabled: b(fd, "detailedMetricsEnabled"), heartbeatSeconds: n("heartbeatSeconds"), idleSeconds: n("idleSeconds"), maxCreditSeconds: n("maxCreditSeconds") },
    retention: { activityMonths: n("activityMonths"), securityMonths: n("securityMonths"), contractualNote: s(fd, "contractualNote") },
    notifications: { firstVisit: b(fd, "firstVisit"), ndaAccepted: b(fd, "ndaAccepted"), accessRequest: b(fd, "accessRequest"), questionCreated: b(fd, "questionCreated"),
      emailTo: s(fd, "emailTo").split(/[\s,;]+/).filter(Boolean) },
    invitations: { expiryDays: n("expiryDays") },
  };
  await run("/admin/settings", () => setSetting(admin.userId, key, values[key]), "saved");
}

export async function retentionAction(fd: FormData) {
  const admin = await requireAdmin();
  const dryRun = s(fd, "mode") !== "apply";
  const r = await applyRetention(admin.userId, { dryRun });
  back("/admin/settings", { msg: `${dryRun ? "Simulación" : "Aplicado"}: actividad anonimizada ${r.activityAnonymized}, latidos borrados ${r.heartbeatsDeleted}, seguridad borrada ${r.securityDeleted}, sesiones de visor ${r.viewSessionsPruned}` });
}

export async function markNotificationsReadAction() {
  await requireAdmin();
  await db().update(schema.notifications).set({ readAt: new Date() });
  revalidatePath("/admin");
}

export async function adminSignOutAction() {
  await auth().api.signOut({ headers: await headers() });
  redirect("/admin/login");
}
