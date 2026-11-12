import { notFound } from "next/navigation";
import Link from "next/link";
import { isUuid, loadLibrary, loadSubject, visibleDocuments } from "@/server/permissions";
import { Viewer } from "@/components/Viewer";
import { dict } from "@/lib/i18n";

export default async function PreviewDoc({ params }: { params: Promise<{ id: string; docId: string }> }) {
  const { id, docId } = await params;
  if (!isUuid(id) || !isUuid(docId)) notFound();
  const subject = await loadSubject(id);
  if (!subject) notFound();
  const vis = visibleDocuments(subject, await loadLibrary()).find((d) => d.doc.id === docId);
  if (!vis) notFound();
  const r = subject.recipient as unknown as { displayName: string; locale: string };
  const t = dict(r.locale === "en" ? "en" : "es");
  return (
    <div className="space-y-3">
      <p className="notice notice-warn" role="status"><strong>PREVISUALIZACIÓN ADMINISTRATIVA</strong> — como {r.displayName}. La marca incluye «ADMIN PREVIEW». Sin actividad registrada. <Link href={`/admin/recipients/${id}/preview`}>← Volver</Link></p>
      <h1>{vis.doc.title}</h1>
      <p className="text-sm">Capacidades efectivas: consulta ✓ · descarga con marca {vis.caps.downloadWatermarked ? "✓" : "✗"} · original {vis.caps.downloadOriginal ? "✓" : "✗"} (las descargas no se ejecutan en previsualización)</p>
      <Viewer documentId={vis.doc.id} versionId={vis.version.id} pageCount={vis.version.pageCount ?? 0} pageUrl={`/api/admin/preview/page?r=${id}`} preview
        heartbeatSeconds={15} idleSeconds={60} trackingEnabled={false} downloads={{}} labels={t.viewer} />
    </div>
  );
}
