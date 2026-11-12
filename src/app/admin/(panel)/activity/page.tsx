import Link from "next/link";
import { db, schema } from "@/server/db";
import { recipientSummaries } from "@/server/analytics";
import { ActivityFilters } from "@/components/ActivityFilters";
import { Badge } from "@/components/Flash";
import { fmtDateTime, fmtDuration, DISPLAY_TZ } from "@/lib/format";
import { isUuid } from "@/server/permissions";

export default async function Activity({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const f = { recipientId: isUuid(sp.recipientId ?? "") ? sp.recipientId : undefined, company: sp.company?.slice(0, 100), documentId: isUuid(sp.documentId ?? "") ? sp.documentId : undefined, from: sp.from, to: sp.to };
  const [rows, recipients, documents] = await Promise.all([recipientSummaries(f), db().select().from(schema.recipients), db().select().from(schema.documents)]);
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h1 className="flex-1">Actividad por destinatario</h1><a className="btn btn-secondary btn-sm" href={`/api/admin/export?type=activity&${qs}`}>Exportar CSV</a></div>
      <p className="text-sm text-muted">Definiciones en <Link href="/admin/metrics">Definición de métricas</Link>. Abrir no es leer; tiempo activo es una estimación. Excluye previsualizaciones administrativas y aperturas automáticas de enlaces. Fechas en {DISPLAY_TZ}; filtros por día UTC.</p>
      <ActivityFilters sp={sp} recipients={recipients} documents={documents} />
      <div className="card table-wrap"><table className="tbl"><thead><tr><th>Persona</th><th>Empresa</th><th>Invitación</th><th>NDA aceptado</th><th>Primera visita</th><th>Última visita</th><th>Sesiones</th><th>Docs abiertos</th><th>Aperturas</th><th>Págs. servidas</th><th>Descargas</th><th>Tiempo activo est.</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td><Link href={`/admin/activity/${r.id}`}>{r.display_name}</Link>{r.is_demo && <span className="badge badge-demo ml-1">DEMO</span>}<div className="text-xs text-muted">{r.email}</div></td>
          <td className="text-sm">{r.org ?? r.declared_company ?? "—"}</td><td><Badge v={r.invitation_status} /></td><td className="text-sm">{fmtDateTime(r.nda_accepted_at)}</td>
          <td className="text-sm">{fmtDateTime(r.first_visit)}</td><td className="text-sm">{fmtDateTime(r.last_visit)}</td><td>{r.sessions}</td><td>{r.docs_opened}</td><td>{r.opens}</td><td>{r.pages_served}</td><td>{r.downloads}</td><td>{fmtDuration(r.active_ms)}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}
