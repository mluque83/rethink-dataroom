import { notFound } from "next/navigation";
import Link from "next/link";
import { isUuid, loadLibrary, loadSubject, visibleDocuments } from "@/server/permissions";
import { RoomView } from "@/components/RoomView";

export default async function PreviewRoom({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ q?: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const subject = await loadSubject(id);
  if (!subject) notFound();
  const lib = await loadLibrary();
  const r = subject.recipient as unknown as { displayName: string; email: string; locale: string };
  const { q } = await searchParams;
  return (
    <div className="space-y-4">
      <p className="notice notice-warn sticky top-0 z-20" role="status"><strong>PREVISUALIZACIÓN ADMINISTRATIVA</strong> — viendo como {r.displayName} ({r.email}) con sus permisos efectivos actuales. No se registra actividad del destinatario. <Link href={`/admin/recipients/${id}`}>Salir</Link></p>
      <RoomView docs={visibleDocuments(subject, lib)} sections={lib.sections} locale={r.locale === "en" ? "en" : "es"} basePath={`/admin/recipients/${id}/preview`} q={q} />
    </div>
  );
}
