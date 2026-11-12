// Requirements 4 (gate), 5 (exact version kept, re-acceptance, immutability)
import { describe, test, expect, beforeAll } from "vitest";
import { eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { acceptAgreement, currentAgreement, verifyAcceptanceChain, AgreementChangedError } from "@/server/legal";
import { hasValidAcceptance } from "@/server/recipient-state";
import { admin, recipient, activateLegalDrafts, meta } from "./fixtures";
import type { Recipient } from "@/server/db/schema";

let A: { userId: string };
beforeAll(async () => { A = await admin(); await activateLegalDrafts(A.userId); });
const gate = (r: Recipient) => ({ ok: true as const, stage: "onboarding" as const, recipient: r, userId: r.userId, sessionId: `sess-${r.id}`, email: r.email });
const input = (sha: string, extra = {}) => ({ fullName: "Ana Test", company: "Fondo SL", position: "Analyst", actingCapacity: "personal", authorityDeclared: false, accepted: true, displayedSha256: sha, locale: "es", ...extra });

describe("terms and NDA", () => {
  test("REQ4 no valid acceptance → recipient stays in onboarding stage", async () => {
    const r = await recipient(A.userId);
    expect(await hasValidAcceptance(r)).toBe(false);
  });

  test("checkbox must be affirmatively ticked; representation requires entity + declaration", async () => {
    const r = await recipient(A.userId);
    const ag = (await currentAgreement(r))!;
    await expect(acceptAgreement(gate(r), { ...input(ag.sha256), accepted: false }, meta)).rejects.toThrow();
    await expect(acceptAgreement(gate(r), input(ag.sha256, { actingCapacity: "on_behalf" }), meta)).rejects.toThrow();
    expect(await hasValidAcceptance(r)).toBe(false);
  });

  test("REQ5 the exact displayed text, versions, hash and evidence are stored", async () => {
    const r = await recipient(A.userId);
    const ag = (await currentAgreement(r))!;
    const acc = await acceptAgreement(gate(r), input(ag.sha256, { actingCapacity: "on_behalf", representedEntity: "Fondo SL", authorityDeclared: true }), meta);
    expect(acc.displayedText).toBe(ag.text);
    expect(acc.displayedTextSha256).toBe(ag.sha256);
    expect(acc.ndaVersionId).toBe(ag.nda.id);
    expect(acc.ipAddress).toBe(meta.ip);
    expect(acc.actionLabel).toBe("Aceptar y acceder");
    expect(acc.verifiedEmail).toBe(r.email);
    expect(acc.representedEntity).toBe("Fondo SL");
    expect(Math.abs(acc.acceptedAt.getTime() - Date.now())).toBeLessThan(60_000);
    expect(await hasValidAcceptance(r)).toBe(true);
    expect((await verifyAcceptanceChain()).ok).toBe(true);
  });

  test("REQ5 records are protected from ordinary modification", async () => {
    const r = await recipient(A.userId);
    const ag = (await currentAgreement(r))!;
    const acc = await acceptAgreement(gate(r), input(ag.sha256), meta);
    await expect(db().execute(sql`UPDATE acceptances SET declared_full_name = 'Other' WHERE id = ${acc.id}`)).rejects.toThrow();
    await expect(db().execute(sql`DELETE FROM acceptances WHERE id = ${acc.id}`)).rejects.toThrow();
    await expect(db().execute(sql`UPDATE legal_text_versions SET body = 'changed' WHERE id = ${ag.nda.id}`)).rejects.toThrow();
    // retention mode does not unlock contractual evidence
    await expect(db().transaction(async (tx) => { await tx.execute(sql`SET LOCAL app.retention = 'on'`); await tx.execute(sql`DELETE FROM acceptances WHERE id = ${acc.id}`); })).rejects.toThrow();
  });

  test("REQ5 a material change requires re-acceptance; previous acceptance and version are kept", async () => {
    const r = await recipient(A.userId);
    const ag = (await currentAgreement(r))!;
    const first = await acceptAgreement(gate(r), input(ag.sha256), meta);
    // a stale page (old hash) is rejected after the change
    const [v2] = await db().insert(schema.legalTextVersions).values({ legalTextId: ag.nda.legalTextId, versionLabel: `0.2-${Date.now()}`, body: ag.nda.body + "\n\nCláusula nueva.", bodySha256: "x", requiresReacceptance: true }).returning();
    await db().execute(sql`UPDATE legal_text_versions SET status = 'retired' WHERE id = ${ag.nda.id}`);
    await db().update(schema.legalTextVersions).set({ status: "active", activatedAt: new Date() }).where(eq(schema.legalTextVersions.id, v2.id));
    expect(await hasValidAcceptance(r)).toBe(false);
    await expect(acceptAgreement(gate(r), input(ag.sha256), meta)).rejects.toBeInstanceOf(AgreementChangedError);
    const ag2 = (await currentAgreement(r))!;
    expect(ag2.nda.id).toBe(v2.id);
    await acceptAgreement(gate(r), input(ag2.sha256), meta);
    expect(await hasValidAcceptance(r)).toBe(true);
    const kept = await db().query.acceptances.findFirst({ where: eq(schema.acceptances.id, first.id) });
    expect(kept!.ndaVersionId).toBe(ag.nda.id);
    expect((await db().query.legalTextVersions.findFirst({ where: eq(schema.legalTextVersions.id, ag.nda.id) }))!.body).toBe(ag.nda.body);
    expect((await verifyAcceptanceChain()).ok).toBe(true);
  });
});
