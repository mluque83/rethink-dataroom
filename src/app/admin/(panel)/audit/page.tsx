import { desc, ilike, and, gte, lte } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { verifyAcceptanceChain } from "@/server/legal";
import { fmtDateTime } from "@/lib/format";

export default async function Audit({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const conds = [];
  if (sp.action) conds.push(ilike(schema.auditEvents.action, `%${sp.action.slice(0, 60)}%`));
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "")) conds.push(gte(schema.auditEvents.at, new Date(sp.from)));
  if (/^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "")) conds.push(lte(schema.auditEvents.at, new Date(`${sp.to}T23:59:59Z`)));
  const rows = await db().select().from(schema.auditEvents).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.auditEvents.at)).limit(500);
  const chain = await verifyAcceptanceChain();
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h1 className="flex-1">Auditoría</h1><a className="btn btn-secondary btn-sm" href="/api/admin/export?type=audit">Exportar CSV</a></div>
      <p className={`notice ${chain.ok ? "" : "notice-danger"}`}>Cadena de aceptaciones: {chain.checked} registros, {chain.ok ? "verificación correcta" : `ROTA en ${chain.broken.join(", ")}`}. El hash encadenado aporta indicios de manipulación frente a cambios ordinarios; no es una garantía absoluta (un superusuario de BD podría reescribir la cadena completa). Para mayor garantía: exportar periódicamente y sellar externamente.</p>
      <form className="card flex flex-wrap gap-2 items-end"><div><label className="lbl" htmlFor="a">Acción contiene</label><input id="a" name="action" defaultValue={sp.action} className="input" placeholder="permission, version.published…" /></div>
        <div><label className="lbl" htmlFor="af">Desde</label><input id="af" type="date" name="from" defaultValue={sp.from} className="input" /></div><div><label className="lbl" htmlFor="at">Hasta</label><input id="at" type="date" name="to" defaultValue={sp.to} className="input" /></div><button className="btn btn-secondary">Filtrar</button></form>
      <div className="card table-wrap"><table className="tbl"><thead><tr><th>Fecha</th><th>Actor</th><th>Acción</th><th>Objeto</th><th>Detalle</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td className="text-xs whitespace-nowrap">{fmtDateTime(r.at)}</td><td className="text-xs">{r.actorType} {r.actorUserId?.slice(0, 8)}</td><td>{r.action}</td><td className="text-xs">{r.targetType} {r.targetId?.slice(0, 8)}</td><td className="text-xs break-all max-w-md">{JSON.stringify(r.details)?.slice(0, 240)}</td></tr>)}
      </tbody></table></div>
    </div>
  );
}
