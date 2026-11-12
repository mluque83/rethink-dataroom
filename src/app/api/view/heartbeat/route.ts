import { z } from "zod";
import { recipientGate } from "@/server/authz";
import { recordHeartbeat } from "@/server/activity";
import { notFound, sameOrigin } from "@/server/http";

const hb = z.object({ viewSessionId: z.string().uuid(), seq: z.number().int().min(0).max(1_000_000), visible: z.boolean(), active: z.boolean(), page: z.number().int().min(1).max(10000).optional() });

/** Client signal (can be lost or manipulated) — used only for ESTIMATED active time. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return notFound();
  const g = await recipientGate();
  if (!g.ok || g.stage !== "ready") return notFound();
  const parsed = hb.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Bad request", { status: 400 });
  const r = await recordHeartbeat(g.recipient.id, parsed.data);
  return Response.json({ ok: true, duplicate: r.duplicate }, { headers: { "Cache-Control": "private, no-store" } });
}
