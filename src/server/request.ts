import "server-only";
import { headers } from "next/headers";

export interface RequestMeta { ip: string | null; userAgent: string | null }
export async function requestMeta(): Promise<RequestMeta> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { ip: fwd || h.get("x-real-ip") || null, userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

