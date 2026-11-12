// Production configuration guard: unsafe combinations must refuse to start.
import { describe, test, expect } from "vitest";
import { execFileSync } from "node:child_process";

const base = {
  APP_ENV: "production", APP_URL: "https://dataroom.rethinkmedical.es", DATABASE_URL: "postgres://x@127.0.0.1:1/x",
  BETTER_AUTH_SECRET: "x".repeat(48), LOG_HMAC_KEY: "y".repeat(32), STORAGE_DRIVER: "s3", S3_BUCKET: "b", S3_SSE: "AES256",
  EMAIL_PROVIDER: "smtp", SMTP_HOST: "smtp.example.invalid", CONVERTER_SANDBOX: "bwrap", SCANNER: "clamav", DEV_ALLOW_UNSCANNED_RELEASE: "true",
};
function load(over: Record<string, string>) {
  const code = `import("./src/server/env.ts").then(m => { const e = m.env(); console.log(JSON.stringify({ ok: true, devRelease: e.DEV_ALLOW_UNSCANNED_RELEASE })); }).catch(e => console.log(JSON.stringify({ ok: false, error: e.message })))`;
  const out = execFileSync("node", ["--conditions=react-server", "--import", "tsx", "-e", code], { env: { PATH: process.env.PATH!, ...base, ...over } }).toString();
  return JSON.parse(out.trim().split("\n").pop()!);
}

describe("production configuration guard", () => {
  test("valid production config loads and disables the dev-only unscanned release", () => expect(load({})).toEqual({ ok: true, devRelease: false }));
  for (const [k, v, msg] of [
    ["STORAGE_DRIVER", "local", "STORAGE_DRIVER"], ["EMAIL_PROVIDER", "dev", "EMAIL_PROVIDER"], ["APP_URL", "http://dataroom.rethinkmedical.es", "https"],
    ["CONVERTER_SANDBOX", "none", "CONVERTER_SANDBOX"], ["S3_SSE", "none", "S3_SSE"],
  ]) test(`refuses ${k}=${v}`, () => { const r = load({ [k]: v }); expect(r.ok).toBe(false); expect(r.error).toContain(msg); });
  test("never prints secret values in configuration errors", () => {
    const r = load({ BETTER_AUTH_SECRET: "short-secret-value" });
    expect(r.ok).toBe(false); expect(r.error).not.toContain("short-secret-value");
  });
});
