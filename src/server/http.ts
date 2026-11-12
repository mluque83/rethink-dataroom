import "server-only";
import { env } from "./env";

/** Same generic answer for "does not exist", "not allowed" and "not authenticated" on content APIs. */
export const notFound = () => new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

/** CSRF defence for JSON POST endpoints (cookies are SameSite=Lax in addition). */
export function sameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(env().APP_URL).origin || new URL(origin).host === req.headers.get("host"); } catch { return false; }
}

export const privateHeaders = (type: string, extra: Record<string, string> = {}) => ({
  "Content-Type": type,
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  ...extra,
});

export const contentDisposition = (name: string) =>
  `attachment; filename="${name.replace(/[^\w.\- ]+/g, "_").slice(0, 120)}"; filename*=UTF-8''${encodeURIComponent(name.slice(0, 120))}`;
