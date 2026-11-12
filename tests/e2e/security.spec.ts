// HTTP-level controls (requirements 1 and 4, plus headers / CSRF / exposed endpoints)
import { test, expect } from "@playwright/test";
import { q } from "./helpers";

test("REQ1 no session → no content, previews, exports or agreement copies", async ({ request }) => {
  const [v] = await q<{ d: string; v: string }>("SELECT document_id d, id v FROM document_versions WHERE status = 'published' LIMIT 1");
  const d = v?.d ?? "00000000-0000-4000-8000-000000000000", vid = v?.v ?? d;
  for (const url of [`/api/view/page?d=${d}&v=${vid}&p=1`, `/api/view/download?d=${d}&v=${vid}&kind=wm`, `/api/view/download?d=${d}&v=${vid}&kind=original`,
    `/api/admin/render?v=${vid}&p=1`, `/api/admin/preview/page?r=${d}&d=${d}&v=${vid}&p=1`, "/api/admin/export?type=index", "/api/admin/export?type=audit",
    "/api/agreement/current", "/api/agreement/accepted", "/api/admin/watermark-sample?r=" + d]) {
    const r = await request.get(url, { maxRedirects: 0 });
    expect(r.status(), url).toBe(404);
  }
  for (const p of ["/room", "/room/qa", "/onboarding", "/admin", "/admin/library", "/admin/dev-mailbox"]) {
    const r = await request.get(p, { maxRedirects: 0 });
    expect([307, 308, 303], p).toContain(r.status());
  }
  // private storage is never web-reachable
  for (const p of ["/.local/storage/originals", "/.env.local", "/migrations/0000_init.sql"]) expect((await request.get(p)).status(), p).toBe(404);
});

test("recipient OTP endpoints of the auth library are not exposed over HTTP", async ({ request }) => {
  for (const p of ["/api/auth/sign-in/email-otp", "/api/auth/email-otp/send-verification-otp", "/api/auth/sign-up/email", "/api/auth/email-otp/reset-password"]) {
    expect((await request.post(p, { data: { email: "x@example.test" } })).status(), p).toBe(404);
  }
});

test("CSRF: JSON POST endpoints refuse foreign origins", async ({ request }) => {
  const r = await request.post("/api/view/heartbeat", { headers: { Origin: "https://evil.example" }, data: { viewSessionId: "00000000-0000-4000-8000-000000000000", seq: 1, visible: true, active: true } });
  expect(r.status()).toBe(404);
});

test("security headers and no caching", async ({ request }) => {
  const r = await request.get("/access");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toMatch(/script-src 'self' 'nonce-/);
  expect(h["cache-control"]).toContain("no-store");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("no-referrer");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-powered-by"]).toBeUndefined();
});
