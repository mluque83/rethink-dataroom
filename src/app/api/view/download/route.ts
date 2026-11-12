import { recipientGate } from "@/server/authz";
import { authorizeVersion } from "@/server/permissions";
import { watermarkedDownloadFor, originalFor } from "@/server/documents/delivery";
import { recordActivity } from "@/server/activity";
import { notFound, privateHeaders, contentDisposition } from "@/server/http";
import { requestMeta } from "@/server/request";
import { audit } from "@/server/audit";

export async function GET(req: Request) {
  const u = new URL(req.url);
  const g = await recipientGate();
  if (!g.ok || g.stage !== "ready") return notFound();
  const a = await authorizeVersion(g.recipient.id, u.searchParams.get("d") ?? "", u.searchParams.get("v") ?? "");
  if (!a) return notFound();
  const kind = u.searchParams.get("kind");
  const meta = await requestMeta();
  if (kind === "wm" && a.caps.downloadWatermarked) {
    const pdf = await watermarkedDownloadFor(g.recipient, a.version, a.doc.title);
    await recordActivity({ recipientId: g.recipient.id, sessionId: g.sessionId, kind: "download_watermarked", documentId: a.doc.id, versionId: a.version.id, ip: meta.ip, userAgent: meta.userAgent });
    return new Response(new Uint8Array(pdf), { headers: privateHeaders("application/pdf", { "Content-Disposition": contentDisposition(`${a.doc.title} - ${g.recipient.accessCode}.pdf`) }) });
  }
  if (kind === "original" && a.caps.downloadOriginal) {
    const o = await originalFor(a.version);
    if (!o) return notFound();
    await recordActivity({ recipientId: g.recipient.id, sessionId: g.sessionId, kind: "download_original", documentId: a.doc.id, versionId: a.version.id, ip: meta.ip, userAgent: meta.userAgent });
    await audit({ actorType: "recipient", actorUserId: g.userId, action: "document.original_downloaded", targetType: "document_version", targetId: a.version.id });
    return new Response(new Uint8Array(o.buf), { headers: privateHeaders("application/octet-stream", { "Content-Disposition": contentDisposition(`${a.doc.title}.${o.ext}`) }) });
  }
  return notFound();
}
