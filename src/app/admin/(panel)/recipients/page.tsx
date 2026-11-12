import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { Badge, Flash } from "@/components/Flash";
import { fmtDateTime } from "@/lib/format";
import { organizationAction } from "../actions";

export default async function Recipients({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const rows = (await db().execute<{ id: string; display_name: string; email: string; status: string; org: string | null; is_demo: boolean; inv: string | null; inv_exp: Date | null; accepted: Date | null; expires: Date | null }>(sql`
    SELECT r.id, r.display_name, r.email, r.status, o.name org, r.is_demo, r.access_expires_at expires,
      (SELECT status FROM invitations i WHERE i.recipient_id = r.id ORDER BY created_at DESC LIMIT 1) inv,
      (SELECT expires_at FROM invitations i WHERE i.recipient_id = r.id ORDER BY created_at DESC LIMIT 1) inv_exp,
      (SELECT max(accepted_at) FROM acceptances a WHERE a.recipient_id = r.id) accepted
    FROM recipients r LEFT JOIN organizations o ON o.id = r.organization_id ORDER BY r.created_at DESC`)).rows;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h1 className="flex-1">Destinatarios</h1><Link className="btn" href="/admin/recipients/new">Nuevo destinatario</Link></div>
      <Flash searchParams={searchParams} />
      <div className="card table-wrap"><table className="tbl"><thead><tr><th>Nombre</th><th>Correo</th><th>Organización</th><th>Estado</th><th>Invitación</th><th>NDA aceptado</th><th>Caducidad</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td><Link href={`/admin/recipients/${r.id}`}>{r.display_name}</Link> {r.is_demo && <span className="badge badge-demo">DEMO</span>}</td><td className="text-sm">{r.email}</td><td>{r.org ?? "—"}</td>
          <td><Badge v={r.status} /></td><td><Badge v={r.inv} /> {r.inv_exp && <span className="text-xs text-muted">hasta {fmtDateTime(r.inv_exp)}</span>}</td><td className="text-sm">{fmtDateTime(r.accepted)}</td><td className="text-sm">{fmtDateTime(r.expires)}</td></tr>)}
      </tbody></table></div>
      <form action={organizationAction} className="card flex flex-wrap gap-2 items-end"><input type="hidden" name="returnTo" value="/admin/recipients" />
        <div><label className="lbl" htmlFor="org">Nueva organización</label><input id="org" name="name" required className="input" /></div>
        <select name="kind" className="input max-w-[12rem]"><option value="investor">Inversor</option><option value="advisor">Asesor</option><option value="strategic">Socio estratégico</option><option value="other">Otro</option></select>
        <button className="btn btn-secondary">Añadir</button></form>
    </div>
  );
}
