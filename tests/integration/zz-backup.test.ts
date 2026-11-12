// Requirement 18: a backup can be restored into a test environment and verified.
import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { acceptAgreement, currentAgreement } from "@/server/legal";
import { admin, recipient, publishedDoc, activateLegalDrafts, meta } from "./fixtures";

describe("backup and restore", () => {
  test("REQ18 backup → restore into isolated DB/storage → integrity verified", async () => {
    // self-contained data: a published document (files + renders) and an acceptance record
    const A = await admin();
    await activateLegalDrafts(A.userId);
    await publishedDoc(A, "00");
    const r = await recipient(A.userId);
    const ag = (await currentAgreement(r))!;
    await acceptAgreement({ ok: true, stage: "onboarding", recipient: r, userId: r.userId, sessionId: "s-backup", email: r.email },
      { fullName: "Backup Test", actingCapacity: "personal", authorityDeclared: false, accepted: true, displayedSha256: ag.sha256, locale: "es" }, meta);

    const dir = `.local/backup-test-${Date.now()}`;
    const env = { ...process.env, ENV_FILE: ".env.test.local" };
    execFileSync("bash", ["scripts/backup.sh", dir], { env, stdio: "pipe" });
    const out = execFileSync("bash", ["scripts/restore-test.sh", dir], { env, stdio: "pipe" }).toString();
    expect(out).toContain("RESTORE VERIFIED");
    const stats = JSON.parse(out.split("\n").find((l) => l.startsWith("{"))!);
    expect(stats.files).toBeGreaterThan(0);
    expect(stats.acceptanceRecords).toBeGreaterThan(0);
    rmSync(dir, { recursive: true, force: true });
  });
});
