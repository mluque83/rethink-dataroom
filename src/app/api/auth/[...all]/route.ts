import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/server/auth";

/**
 * Only the endpoints needed by the ADMIN login (password + TOTP) and session
 * handling are exposed over HTTP. Recipient OTP flows are driven exclusively by
 * server actions that first validate the invitation/recipient, so the generic
 * e-mail OTP endpoints are not reachable from the browser.
 */
const ALLOWED = new Set([
  "/sign-in/email", "/sign-out", "/get-session",
  "/two-factor/enable", "/two-factor/verify-totp", "/two-factor/get-totp-uri",
  "/two-factor/verify-backup-code", "/two-factor/generate-backup-codes",
]);

function allowed(req: Request) {
  const path = new URL(req.url).pathname.replace(/^\/api\/auth/, "");
  return ALLOWED.has(path);
}
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: Request) {
  if (!allowed(req)) return notFound();
  return toNextJsHandler(auth()).GET(req);
}
export async function POST(req: Request) {
  if (!allowed(req)) return notFound();
  return toNextJsHandler(auth()).POST(req);
}
