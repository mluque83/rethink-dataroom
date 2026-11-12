import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { documentBreakdown, timeline } from "@/server/analytics";
import { isUuid } from "@/server/permissions";
import { ActivityFilters } from "@/components/ActivityFilters";
import { fmtDateTime, fmtDuration } from "@/lib/format";

export default async function RecipientActivity({ params, searchParams }: { params: Promise<{ recipientId: string }>; searchParams: Promise<Record<string, string>> }) {
  const { recipientId } = await params;
  if (!isUuid(recipientId)) notFound();
  const r = await db().query.recipients.findFirst({ where: eq(schema.recipients.id, recipientId) });
  if (!r) notFound();
  const sp = await searchParams;
  const f = { from: sp.from, to: sp.to };
  const [docs, tl, documents] = await Promise.all([documentBreakdown(recipientId, f), timeline(recipientId, f), db().select().from(schema.documents)]);
  return (
    <div className="space-y-4">
      <Link href="/admin/activity" className="text-sm">← Actividad</Link>
      <div className="flex items-center gap-2"><h1 className="flex-1">{r.displayName} — actividad</h1><a className="btn btn-secondary btn-sm" href={`/api/admin/export?type=timeline&recipientId=${recipientId}`}>Exportar cronología CSV</a></div>
      <ActivityFilters sp={sp} documents={documents} hidePerson />
      <section className="card table-wrap"><h2>Por documento y versión</h2>
        <table className="tbl"><thead><tr><th>Documento</th><th>Versión</th><th>Aperturas</th><th>Páginas servidas</th><th>Descargas</th><th>Tiempo activo est.</th><th>Primera / última apertura</th></tr></thead><tbody>
          {docs.map((d) => <tr key={d.version_id}><td>{d.ref} {d.title}</td><td>v{d.version_number}</td><td>{d.opens}</td><td>{d.pages_served} / {d.page_count}</td><td>{d.downloads}</td><td>{fmtDuration(d.active_ms)}</td><td className="text-xs">{fmtDateTime(d.first_open)} / {fmtDateTime(d.last_open)}</td></tr>)}
        </tbody></table></section>
      <section className="card table-wrap"><h2>Cronología</h2>
        <p className="text-xs text-muted">Origen: «server» = evento confirmado por el servidor; «security» = registro de seguridad; «audit» = acción administrativa sobre este destinatario. El tiempo activo procede de señales del navegador (no listadas aquí).</p>
        <table className="tbl"><thead><tr><th>Fecha</th><th>Origen</th><th>Evento</th><th>Detalle</th></tr></thead><tbody>
          {tl.map((e, i) => <tr key={i}><td className="text-xs whitespace-nowrap">{fmtDateTime(e.at)}</td><td><span className="badge">{e.source}</span></td><td>{e.kind}</td><td className="text-sm">{e.detail}</td></tr>)}
        </tbody></table></section>
    </div>
  );
}
