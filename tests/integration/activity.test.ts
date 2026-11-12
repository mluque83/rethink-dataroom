// Requirements 14 (active time) and 15 (bots / admin previews do not inflate)
import { describe, test, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { computeCredit, recordHeartbeat } from "@/server/activity";
import { watermarkedPageFor } from "@/server/documents/delivery";
import { beginInvitation } from "@/server/access";
import { issueInvitation } from "@/server/recipients";
import { admin, recipient, publishedDoc } from "./fixtures";

let A: { userId: string };
beforeAll(async () => { A = await admin(); });

describe("computeCredit (pure)", () => {
  const base = { lastBeatAt: 0, clockCreditedUntil: 0, visible: true, active: true, maxCreditMs: 30_000 };
  test("credits elapsed time while visible and active", () => expect(computeCredit({ ...base, now: 15_000 })).toBe(15_000));
  test("idle → nothing", () => expect(computeCredit({ ...base, now: 15_000, active: false })).toBe(0));
  test("hidden tab → nothing", () => expect(computeCredit({ ...base, now: 15_000, visible: false })).toBe(0));
  test("abrupt close / lost beats are capped", () => expect(computeCredit({ ...base, now: 3_600_000 })).toBe(30_000));
  test("time already credited elsewhere is not counted twice", () => expect(computeCredit({ ...base, now: 15_000, clockCreditedUntil: 10_000 })).toBe(5_000));
});

describe("recordHeartbeat (DB)", () => {
  test("REQ14 pauses on inactivity, is idempotent and never double-counts across tabs", async () => {
    const d = await publishedDoc(A, "02");
    const r = await recipient(A.userId);
    const t0 = Date.now();
    const vs = async () => (await db().insert(schema.viewSessions).values({ recipientId: r.id, sessionId: "s", documentId: d.doc.id, versionId: d.version.id, openedAt: new Date(t0) }).returning())[0].id;
    const tabA = await vs(), tabB = await vs();
    const at = (s: number) => new Date(t0 + s * 1000);
    expect((await recordHeartbeat(r.id, { viewSessionId: tabA, seq: 0, visible: true, active: true }, at(15))).credited).toBe(15_000);
    // retry of the same beat (network retry) → duplicate, no credit
    expect(await recordHeartbeat(r.id, { viewSessionId: tabA, seq: 0, visible: true, active: true }, at(16))).toMatchObject({ duplicate: true, credited: 0 });
    // second tab open at the same time → overlapping interval not credited again
    expect((await recordHeartbeat(r.id, { viewSessionId: tabB, seq: 0, visible: true, active: true }, at(15))).credited).toBe(0);
    // idle interval → nothing
    expect((await recordHeartbeat(r.id, { viewSessionId: tabA, seq: 1, visible: true, active: false }, at(30))).credited).toBe(0);
    // long gap after a lost connection → capped (30 s default)
    expect((await recordHeartbeat(r.id, { viewSessionId: tabA, seq: 2, visible: true, active: true }, at(600))).credited).toBe(30_000);
    const total = (await db().select().from(schema.viewSessions).where(eq(schema.viewSessions.recipientId, r.id))).reduce((s, x) => s + x.activeMs, 0);
    expect(total).toBe(45_000);
    // a heartbeat for someone else's viewer is rejected
    const other = await recipient(A.userId);
    expect(await recordHeartbeat(other.id, { viewSessionId: tabA, seq: 9, visible: true, active: true }, at(620))).toMatchObject({ credited: 0, rejected: true });
  });

  test("REQ15 admin preview renders and link fetches create no recipient activity", async () => {
    const d = await publishedDoc(A, "02");
    const r = await recipient(A.userId);
    await watermarkedPageFor(r, d.version, 1, { preview: true });
    const { url } = await issueInvitation(A.userId, r.id, { send: false });
    // a scanner that only GETs the link never reaches the server with the token (fragment);
    // even a bot POSTing a wrong address produces only a security-log entry
    await beginInvitation(url.split("#t=")[1], "scanner@example.test", { ip: "192.0.2.1", userAgent: "Mimecast scanner" });
    expect(await db().select().from(schema.activityEvents).where(eq(schema.activityEvents.recipientId, r.id))).toHaveLength(0);
    expect((await db().query.recipients.findFirst({ where: eq(schema.recipients.id, r.id) }))!.status).toBe("invited");
  });
});
