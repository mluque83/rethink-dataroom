import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db, schema } from "./db";
import { env } from "./env";

/** 256-bit URL-safe random token (CSPRNG). */
export const newToken = () => randomBytes(32).toString("base64url");
export const sha256Hex = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");
/** Pseudonymise identifiers (emails, IPs) for security logs and rate-limit keys. */
export const hmac = (s: string) => createHmac("sha256", env().LOG_HMAC_KEY).update(s).digest("hex").slice(0, 32);
export function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, "hex"), bb = Buffer.from(b, "hex");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Non-secret access identifier printed in watermarks: RM-XXXX-XXXX (Crockford-like alphabet). */
export function newAccessCode() {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  const b = randomBytes(8);
  const chars = [...b].map((x) => alphabet[x % alphabet.length]).join("");
  return `RM-${chars.slice(0, 4)}-${chars.slice(4, 8)}`;
}

export const normalizeEmail = (e: string) => e.trim().toLowerCase();
export const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$/i;

/**
 * Only same-origin relative paths are accepted as post-login destinations
 * (prevents open redirects such as //evil.com, /\evil.com, https://evil.com, javascript:).
 */
export function safeRedirectPath(input: string | null | undefined, fallback: string) {
  if (!input || typeof input !== "string") return fallback;
  if (!input.startsWith("/") || input.startsWith("//") || input.startsWith("/\\")) return fallback;
  if (/[\u0000-\u001f\\]/.test(input)) return fallback;
  try {
    const u = new URL(input, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return fallback;
    return u.pathname + u.search;
  } catch { return fallback; }
}

export type { RequestMeta } from "./request";

/**
 * Heuristic only: link pre-fetchers (mail security scanners, previewers) often
 * identify themselves or skip JS. Used to EXCLUDE such fetches from metrics;
 * never used to accuse anyone.
 */
export function classifyClient(ua: string | null): "automated_suspected" | "unknown" {
  if (!ua) return "automated_suspected";
  return /bot|crawler|spider|preview|scanner|safelinks|proofpoint|mimecast|barracuda|urldefense|curl|wget|python-requests|httpclient|headless|facebookexternalhit|slackbot|outlook-ios-linkpreview/i.test(ua)
    ? "automated_suspected" : "unknown";
}

/**
 * Fixed-window rate limiter stored in PostgreSQL (works across processes).
 * Returns true if the action is allowed.
 */
export async function rateLimit(bucket: string, id: string, max: number, windowSeconds: number): Promise<boolean> {
  const key = `${bucket}:${hmac(id)}`;
  const r = await db().execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, window_ends_at)
    VALUES (${key}, 1, now() + make_interval(secs => ${windowSeconds}))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.window_ends_at < now() THEN 1 ELSE rate_limits.count + 1 END,
      window_ends_at = CASE WHEN rate_limits.window_ends_at < now() THEN now() + make_interval(secs => ${windowSeconds}) ELSE rate_limits.window_ends_at END
    RETURNING count`);
  return Number(r.rows[0].count) <= max;
}

export async function securityLog(e: {
  kind: string; recipientId?: string | null; email?: string | null; ip?: string | null;
  clientClass?: string | null; details?: Record<string, unknown>;
}) {
  await db().insert(schema.securityEvents).values({
    kind: e.kind, recipientId: e.recipientId ?? null,
    emailHmac: e.email ? hmac(normalizeEmail(e.email)) : null,
    ipHmac: e.ip ? hmac(e.ip) : null, clientClass: e.clientClass ?? null, details: e.details ?? null,
  });
}
