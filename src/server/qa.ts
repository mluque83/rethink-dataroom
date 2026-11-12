import "server-only";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "./db";
import { audit } from "./audit";
import { loadLibrary, loadSubject, visibleDocuments } from "./permissions";
import { notifyAdmins, recordActivity } from "./activity";
import { DomainError } from "./documents/library";
import type { Recipient } from "./db/schema";

/** Questions a recipient may see: their own, plus ones an admin EXPLICITLY shared with one of their groups. */
export async function questionsForRecipient(recipient: Recipient) {
  const d = db();
  const groups = (await d.select().from(schema.groupMembers).where(eq(schema.groupMembers.recipientId, recipient.id))).map((g) => g.groupId);
  const qs = await d.select({
    id: schema.questions.id, subject: schema.questions.subject, body: schema.questions.body, status: schema.questions.status,
    documentId: schema.questions.documentId, createdAt: schema.questions.createdAt, mine: eq(schema.questions.recipientId, recipient.id),
  }).from(schema.questions).where(groups.length
    ? or(eq(schema.questions.recipientId, recipient.id), and(eq(schema.questions.visibility, "group"), inArray(schema.questions.sharedGroupId, groups)))
    : eq(schema.questions.recipientId, recipient.id)).orderBy(desc(schema.questions.createdAt));
  const ids = qs.map((q) => q.id);
  // ONLY published answers; internal notes are never queried here.
  const ans = ids.length ? await d.select({
    questionId: schema.answers.questionId, body: schema.answers.body, publishedAt: schema.answers.publishedAt, attachmentDocumentIds: schema.answers.attachmentDocumentIds,
  }).from(schema.answers).where(and(inArray(schema.answers.questionId, ids), eq(schema.answers.status, "published"))) : [];
  const subject = await loadSubject(recipient.id);
  const visible = subject ? visibleDocuments(subject, await loadLibrary()) : [];
  const vis = new Map(visible.map((v) => [v.doc.id, v.doc.title]));
  return qs.map((q) => ({
    ...q,
    // a linked document is shown only if the reader can see it
    documentTitle: q.documentId && vis.has(q.documentId) ? vis.get(q.documentId)! : null,
    documentId: q.documentId && vis.has(q.documentId) ? q.documentId : null,
    answers: ans.filter((a) => a.questionId === q.id).map((a) => ({
      body: a.body, publishedAt: a.publishedAt,
      attachments: a.attachmentDocumentIds.filter((id) => vis.has(id)).map((id) => ({ id, title: vis.get(id)! })),
    })),
  }));
}

export const questionInput = z.object({
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(3).max(5000),
  documentId: z.string().uuid().optional().or(z.literal("")),
});

export async function askQuestion(recipient: Recipient, sessionId: string, raw: unknown) {
  if (!recipient.qaEnabled) throw new DomainError("qa_disabled");
  const input = questionInput.parse(raw);
  let documentId: string | null = null;
  if (input.documentId) {
    const subject = await loadSubject(recipient.id);
    const visible = subject ? visibleDocuments(subject, await loadLibrary()) : [];
    if (!visible.some((v) => v.doc.id === input.documentId)) throw new DomainError("not_found");
    documentId = input.documentId;
  }
  const [q] = await db().insert(schema.questions).values({ recipientId: recipient.id, subject: input.subject, body: input.body, documentId }).returning();
  await recordActivity({ recipientId: recipient.id, sessionId, kind: "question_created", documentId: documentId ?? undefined });
  await notifyAdmins("question_created", recipient, { questionId: q.id });
  return q;
}

/* -------------------------------- admin -------------------------------- */

export async function adminUpdateQuestion(adminId: string, questionId: string, patch: { status?: string; assigneeUserId?: string | null }) {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.status) set.status = patch.status;
  if (patch.assigneeUserId !== undefined) set.assigneeUserId = patch.assigneeUserId || null;
  await db().update(schema.questions).set(set).where(eq(schema.questions.id, questionId));
  await audit({ actorType: "admin", actorUserId: adminId, action: "qa.question_updated", targetType: "question", targetId: questionId, details: patch });
}

export async function addInternalNote(adminId: string, questionId: string, body: string) {
  await db().insert(schema.questionNotes).values({ questionId, authorUserId: adminId, body: body.slice(0, 5000) });
}

export async function saveAnswerDraft(adminId: string, questionId: string, body: string, attachmentDocumentIds: string[]) {
  const existing = await db().query.answers.findFirst({ where: and(eq(schema.answers.questionId, questionId), eq(schema.answers.status, "draft")) });
  if (existing) {
    await db().update(schema.answers).set({ body: body.slice(0, 10000), attachmentDocumentIds }).where(eq(schema.answers.id, existing.id));
    return existing.id;
  }
  const [a] = await db().insert(schema.answers).values({ questionId, body: body.slice(0, 10000), attachmentDocumentIds, createdBy: adminId }).returning();
  return a.id;
}

/** Explicit action: makes the answer visible to whoever can see the question. */
export async function publishAnswer(adminId: string, answerId: string) {
  const [a] = await db().update(schema.answers).set({ status: "published", publishedAt: new Date(), publishedBy: adminId })
    .where(and(eq(schema.answers.id, answerId), eq(schema.answers.status, "draft"))).returning();
  if (!a) throw new DomainError("not_found");
  await db().update(schema.questions).set({ status: "answered", updatedAt: new Date() }).where(eq(schema.questions.id, a.questionId));
  await audit({ actorType: "admin", actorUserId: adminId, action: "qa.answer_published", targetType: "question", targetId: a.questionId, details: { answerId } });
}

/** Explicit, audited action. Never automatic. */
export async function shareQuestionWithGroup(adminId: string, questionId: string, groupId: string | null) {
  await db().update(schema.questions).set(groupId ? { visibility: "group", sharedGroupId: groupId } : { visibility: "author_only", sharedGroupId: null })
    .where(eq(schema.questions.id, questionId));
  await audit({ actorType: "admin", actorUserId: adminId, action: groupId ? "qa.shared_with_group" : "qa.unshared", targetType: "question", targetId: questionId, details: { groupId } });
}
