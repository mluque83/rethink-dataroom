import { notFound } from "next/navigation";
import Link from "next/link";
import { requireRecipient } from "@/server/authz";
import { loadLibrary, loadSubject, visibleDocuments } from "@/server/permissions";
import { Viewer } from "@/components/Viewer";
import { dict } from "@/lib/i18n";
import { getSetting } from "@/server/settings";
import { fmtDate } from "@/lib/format";

export default async function DocPage({ params, searchParams }: { params: Promise<{ docId: string }>; searchParams: Promise<{ v?: string }> }) {
  const g = await requireRecipient("ready");
  const l = g.recipient.locale === "en" ? "en" : "es";
  const t = dict(l);
  const { docId } = await params;
  const { v } = await searchParams;
  const subject = await loadSubject(g.recipient.id);
  const vis = subject ? visibleDocuments(subject, await loadLibrary()).find((d) => d.doc.id === docId) : undefined;
  if (!vis) notFound();
  const chosen = v ? [{ version: vis.version, caps: vis.caps }, ...vis.olderVersions].find((x) => x.version.id === v) : { version: vis.version, caps: vis.caps };
  if (!chosen) notFound();
  const tracking = await getSetting("tracking");
  const q = `d=${vis.doc.id}&v=${chosen.version.id}`;
  return (
    <div className="space-y-3">
      <Link href="/room" className="text-sm">← {t.common.back}</Link>
      <h1>{vis.doc.title}</h1>
      <p className="text-sm text-muted">{t.room.version} {chosen.version.versionNumber} · {t.room.docDate}: {fmtDate(vis.doc.documentDate, l)}</p>
      {vis.olderVersions.length > 0 && (
        <p className="text-sm">{t.room.olderVersions}: {[{ version: vis.version }, ...vis.olderVersions].map((o) => (
          <Link key={o.version.id} className="mr-2" href={`/room/doc/${vis.doc.id}?v=${o.version.id}`}>v{o.version.versionNumber}</Link>))}</p>
      )}
      <p className="text-xs text-muted">{t.viewer.watermarkNote} {tracking.detailedMetricsEnabled ? t.viewer.trackingNote : ""}</p>
      <Viewer
        documentId={vis.doc.id} versionId={chosen.version.id} pageCount={chosen.version.pageCount ?? 0} pageUrl="/api/view/page" preview={false}
        heartbeatSeconds={tracking.heartbeatSeconds} idleSeconds={tracking.idleSeconds} trackingEnabled={tracking.detailedMetricsEnabled}
        downloads={{ watermarked: chosen.caps.downloadWatermarked ? `/api/view/download?${q}&kind=wm` : undefined, original: chosen.caps.downloadOriginal ? `/api/view/download?${q}&kind=original` : undefined }}
        labels={t.viewer}
      />
    </div>
  );
}
