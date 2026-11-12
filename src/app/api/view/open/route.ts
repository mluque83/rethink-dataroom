import { recipientGate } from "@/server/authz";
import { authorizeVersion } from "@/server/permissions";
import { db, schema } from "@/server/db";
import { recordActivity } from "@/server/activity";
import { notFound, sameOrigin } from "@/server/http";
import { requestMeta } from "@/server/request";

export async function POST(req: Request) {
  if (!sameOrigin(req)) return notFound();
  const g = await recipientGate();
  if (!g.ok || g.stage !== "ready") return notFound();
  const body = await req.json().catch(() => ({}));
  const a = await authorizeVersion(g.recipient.id, String(body.documentId ?? ""), String(body.versionId ?? ""));
  if (!a) return notFound();
  const [vs] = await db().insert(schema.viewSessions).values({ recipientId: g.recipient.id, sessionId: g.sessionId, documentId: a.doc.id, versionId: a.version.id }).returning();
  const meta = await requestMeta();
  await recordActivity({ recipientId: g.recipient.id, sessionId: g.sessionId, kind: "document_open", documentId: a.doc.id, versionId: a.version.id, viewSessionId: vs.id, ip: meta.ip, userAgent: meta.userAgent });
  return Response.json({ viewSessionId: vs.id, pageCount: a.version.pageCount }, { headers: { "Cache-Control": "private, no-store" } });
}
