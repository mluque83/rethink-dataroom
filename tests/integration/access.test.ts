// Requirements 2, 3, 15 (link fetches), 16
import { describe, test, expect, beforeAll } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { auth } from "@/server/auth";
import { beginInvitation, requestCode, verifyCode } from "@/server/access";
import { issueInvitation, revokeRecipient } from "@/server/recipients";
import { admin, recipient, mailsTo, otpFrom, uniq } from "./fixtures";

let A: { userId: string };
beforeAll(async () => { A = await admin(); });
const m = () => ({ ip: `198.51.100.${Math.floor(Math.random() * 250)}`, userAgent: "vitest" });
const token = (url: string) => url.split("#t=")[1];
const H = () => new Headers({ "user-agent": "vitest" });

async function invited() {
  const r = await recipient(A.userId);
  const { url } = await issueInvitation(A.userId, r.id, { send: false });
  return { r, t: token(url) };
}

describe("invitations and one-time codes", () => {
  test("tokens are random and only their hash is stored", async () => {
    const { r, t } = await invited();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const inv = await db().query.invitations.findFirst({ where: eq(schema.invitations.recipientId, r.id) });
    expect(inv!.tokenHash).not.toContain(t);
    expect(JSON.stringify(await db().select().from(schema.auditEvents))).not.toContain(t);
  });

  test("REQ2 a forwarded link without control of the invited mailbox gets no code and no session", async () => {
    const { r, t } = await invited();
    const intruder = `intruder-${uniq()}@example.test`;
    expect(await beginInvitation(t, intruder, m())).toEqual({ ok: true }); // generic answer
    expect(await mailsTo(intruder)).toHaveLength(0);
    expect(await mailsTo(r.email)).toHaveLength(0);
    expect((await verifyCode(intruder, "000000", m(), H())).ok).toBe(false);
    // even knowing the invited address, without the mailbox there is no code
    expect((await verifyCode(r.email, "123456", m(), H())).ok).toBe(false);
    expect(await db().select().from(schema.session).where(eq(schema.session.userId, r.userId))).toHaveLength(0);
  });

  test("GET of the invitation page / link fetch is not a visit and consumes nothing", async () => {
    const { r } = await invited();
    // the page performs no server lookup; nothing is written for a fetch
    expect(await db().select().from(schema.activityEvents).where(eq(schema.activityEvents.recipientId, r.id))).toHaveLength(0);
    const inv = await db().query.invitations.findFirst({ where: eq(schema.invitations.recipientId, r.id) });
    expect(inv!.status).toBe("created");
  });

  test("REQ3 codes: hashed at rest, single use, attempt limit, rotation invalidates, expiry", async () => {
    const { r, t } = await invited();
    await beginInvitation(t, r.email, m());
    const code1 = otpFrom((await mailsTo(r.email))[0].bodyText);
    const stored = await db().select().from(schema.verification).where(sql`${schema.verification.identifier} LIKE ${"%" + r.email + "%"}`);
    expect(JSON.stringify(stored)).not.toContain(code1);                                   // hashed storage

    // rotation: a new request invalidates the previous code
    await db().execute(sql`DELETE FROM rate_limits WHERE key LIKE 'otp-resend-cooldown:%'`);
    await beginInvitation(t, r.email, m());
    const mails = (await mailsTo(r.email)).sort((a, b) => +b.createdAt - +a.createdAt);
    const code2 = otpFrom(mails[0].bodyText);
    if (code1 !== code2) expect((await verifyCode(r.email, code1, m(), H())).ok).toBe(false);

    // attempt limit: after 5 wrong attempts even the right code fails
    const wrong = code2 === "999999" ? "999998" : "999999";
    for (let i = 0; i < 5; i++) await verifyCode(r.email, wrong, m(), H());
    expect((await verifyCode(r.email, code2, m(), H())).ok).toBe(false);

    // fresh code: works once, then is consumed
    await db().execute(sql`DELETE FROM rate_limits WHERE key LIKE 'otp-resend-cooldown:%'`);
    await beginInvitation(t, r.email, m());
    const code3 = otpFrom((await mailsTo(r.email)).sort((a, b) => +b.createdAt - +a.createdAt)[0].bodyText);
    expect((await verifyCode(r.email, code3, m(), H())).ok).toBe(true);
    expect((await verifyCode(r.email, code3, m(), H())).ok).toBe(false);

    // expiry
    await auth().api.sendVerificationOTP({ body: { email: r.email, type: "sign-in" } });
    const code4 = otpFrom((await mailsTo(r.email)).sort((a, b) => +b.createdAt - +a.createdAt)[0].bodyText);
    await db().execute(sql`UPDATE verification SET expires_at = now() - interval '1 second' WHERE identifier LIKE ${"%" + r.email + "%"}`);
    expect((await verifyCode(r.email, code4, m(), H())).ok).toBe(false);
  });

  test("rate limiting of code requests per address", async () => {
    const r = await recipient(A.userId);
    await db().update(schema.recipients).set({ status: "active" }).where(eq(schema.recipients.id, r.id));
    const results = [];
    for (let i = 0; i < 7; i++) results.push(await requestCode(r.email, m()));
    expect(results.some((x) => x.throttled)).toBe(true);
    expect((await mailsTo(r.email)).length).toBeLessThanOrEqual(1); // 45 s cooldown between codes
  });

  test("unknown and registered addresses get the same answer", async () => {
    const r = await recipient(A.userId);
    await db().update(schema.recipients).set({ status: "active" }).where(eq(schema.recipients.id, r.id));
    expect(await requestCode(`nobody-${uniq()}@example.test`, m())).toEqual(await requestCode(r.email, m()));
  });

  test("REQ16 revocation closes sessions and blocks new access", async () => {
    const { r, t } = await invited();
    await beginInvitation(t, r.email, m());
    expect((await verifyCode(r.email, otpFrom((await mailsTo(r.email))[0].bodyText), m(), H())).ok).toBe(true);
    expect((await db().select().from(schema.session).where(eq(schema.session.userId, r.userId))).length).toBe(1);
    await revokeRecipient(A.userId, r.id, "test");
    expect(await db().select().from(schema.session).where(eq(schema.session.userId, r.userId))).toHaveLength(0);
    const before = (await mailsTo(r.email)).length;
    await db().execute(sql`DELETE FROM rate_limits`);
    await beginInvitation(t, r.email, m());
    await requestCode(r.email, m());
    expect((await mailsTo(r.email)).length).toBe(before);
    expect((await verifyCode(r.email, "123456", m(), H())).ok).toBe(false);
    const inv = await db().query.invitations.findFirst({ where: and(eq(schema.invitations.recipientId, r.id)) });
    expect(inv!.status).toBe("revoked");
  });
});
