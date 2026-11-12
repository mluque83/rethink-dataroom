import { and, eq } from "drizzle-orm";
import { recipientGate } from "@/server/authz";
import { authorizeVersion, isUuid } from "@/server/permissions";
import { watermarkedPageFor } from "@/server/documents/delivery";
import { recordActivity } from "@/server/activity";
import { db, schema } from "@/server/db";
import { notFound, privateHeaders } from "@/server/http";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const g = await recipientGate();
  if (!g.ok || g.stage !== "ready") return notFound();
  const a = await authorizeVersion(g.recipient.id, u.searchParams.get("d") ?? "", u.searchParams.get("v") ?? "");
  if (!a) return notFound();
  const page = Number(u.searchParams.get("p"));
  const img = await watermarkedPageFor(g.recipient, a.version, page);
  if (!img) return notFound();
  // "page served" metric: once per viewer instance and page (server-confirmed delivery, not proof of reading)
  const vs = u.searchParams.get("vs") ?? "";
  if (isUuid(vs)) {
    const own = await db().query.viewSessions.findFirst({ where: and(eq(schema.viewSessions.id, vs), eq(schema.viewSessions.recipientId, g.recipient.id)) });
    if (own) {
      const seen = await db().query.activityEvents.findFirst({ where: and(eq(schema.activityEvents.viewSessionId, vs), eq(schema.activityEvents.pageNumber, page), eq(schema.activityEvents.kind, "page_view")) });
      if (!seen) await recordActivity({ recipientId: g.recipient.id, sessionId: g.sessionId, kind: "page_view", documentId: a.doc.id, versionId: a.version.id, pageNumber: page, viewSessionId: vs });
    }
  }
  return new Response(new Uint8Array(img), { headers: privateHeaders("image/png") });
}
