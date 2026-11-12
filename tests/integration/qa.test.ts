// Requirement 17: internal notes and other recipients'/groups' questions stay private
import { describe, test, expect, beforeAll } from "vitest";
import { db, schema } from "@/server/db";
import { askQuestion, questionsForRecipient, addInternalNote, saveAnswerDraft, publishAnswer, shareQuestionWithGroup } from "@/server/qa";
import { admin, recipient, uniq } from "./fixtures";

let A: { userId: string };
beforeAll(async () => { A = await admin(); });

describe("Q&A privacy", () => {
  test("REQ17", async () => {
    const [g1] = await db().insert(schema.groups).values({ name: `G1 ${uniq()}` }).returning();
    const [g2] = await db().insert(schema.groups).values({ name: `G2 ${uniq()}` }).returning();
    const alice = await recipient(A.userId, { qaEnabled: true, groupIds: [g1.id] });
    const bob = await recipient(A.userId, { qaEnabled: true, groupIds: [g1.id] });
    const carol = await recipient(A.userId, { qaEnabled: true, groupIds: [g2.id] });
    const q = await askQuestion(alice, "s", { subject: "Pregunta de Alice", body: "Detalle confidencial de Alice" });
    await addInternalNote(A.userId, q.id, "NOTA INTERNA reservada");
    const ansId = await saveAnswerDraft(A.userId, q.id, "BORRADOR de respuesta", []);
    let a = JSON.stringify(await questionsForRecipient(alice));
    expect(a).toContain("Pregunta de Alice");
    expect(a).not.toContain("NOTA INTERNA");
    expect(a).not.toContain("BORRADOR"); // drafts are not visible until explicitly published
    expect(JSON.stringify(await questionsForRecipient(bob))).not.toContain("Alice"); // same group, not shared
    await publishAnswer(A.userId, ansId);
    a = JSON.stringify(await questionsForRecipient(alice));
    expect(a).toContain("BORRADOR de respuesta");
    await shareQuestionWithGroup(A.userId, q.id, g1.id); // explicit admin action
    expect(JSON.stringify(await questionsForRecipient(bob))).toContain("Pregunta de Alice");
    expect(JSON.stringify(await questionsForRecipient(bob))).not.toContain("NOTA INTERNA");
    expect(JSON.stringify(await questionsForRecipient(carol))).not.toContain("Alice"); // other group
  });

  test("Q&A disabled → cannot ask", async () => {
    const r = await recipient(A.userId, { qaEnabled: false });
    await expect(askQuestion(r, "s", { subject: "abc", body: "abc" })).rejects.toMatchObject({ code: "qa_disabled" });
  });
});
