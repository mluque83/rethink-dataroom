import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { env } from "@/server/env";
import { storage } from "@/server/storage";
import { staleRedactions } from "@/server/documents/library";
import { verifyAcceptanceChain } from "@/server/legal";
import { fmtDateTime } from "@/lib/format";
import { markNotificationsReadAction } from "./actions";
import { Flash } from "@/components/Flash";

export default async function Dashboard({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const one = async <T,>(q: ReturnType<typeof sql>) => (await db().execute(q)).rows as T[];
  const [counts] = await one<Record<string, number>>(sql`SELECT
    (SELECT count(*)::int FROM recipients WHERE status = 'invited') AS invited,
    (SELECT count(*)::int FROM recipients WHERE status = 'active') AS active,
    (SELECT count(*)::int FROM recipients WHERE status = 'revoked') AS revoked,
    (SELECT count(DISTINCT recipient_id)::int FROM acceptances) AS accepted,
    (SELECT count(*)::int FROM document_versions WHERE status IN ('uploaded','processing','in_review','approved')) AS in_pipeline,
    (SELECT count(*)::int FROM document_versions WHERE status = 'conversion_failed') AS failed,
    (SELECT count(*)::int FROM document_versions WHERE scan_status IN ('not_configured','pending','error') AND status NOT IN ('rejected','withdrawn')) AS quarantined,
    (SELECT count(*)::int FROM documents WHERE current_published_version_id IS NOT NULL AND archived_at IS NULL) AS published,
    (SELECT count(*)::int FROM checklist_items WHERE status IN ('expected','pending')) AS pending_items,
    (SELECT count(*)::int FROM questions WHERE status IN ('open','in_progress')) AS open_questions,
    (SELECT count(*)::int FROM legal_text_versions WHERE status = 'active' AND legal_review_status <> 'legal_reviewed') AS legal_unreviewed`);
  const notes = await one<{ kind: string; payload: Record<string, string>; created_at: Date; read_at: Date | null }>(sql`SELECT kind, payload, created_at, read_at FROM notifications ORDER BY created_at DESC LIMIT 15`);
  const stale = await staleRedactions();
  const chain = await verifyAcceptanceChain();
  const health: { ok: boolean; details: Record<string, string> } = await storage().health().catch((e) => ({ ok: false, details: { error: (e as Error).message } }));
  const e = env();
  const card = (label: string, v: number, href: string) => <Link href={href} className="card block no-underline"><div className="text-2xl font-bold text-navy">{v}</div><div className="text-sm text-muted">{label}</div></Link>;
  return (
    <div className="space-y-4">
      <h1>Panel general</h1>
      <Flash searchParams={searchParams} />
      <div className="space-y-2">
        {e.SCANNER === "none" && <p className="notice notice-warn"><strong>Antivirus no configurado.</strong> Las cargas permanecen en cuarentena (no publicables){e.DEV_ALLOW_UNSCANNED_RELEASE ? "; en desarrollo pueden liberarse manualmente con registro de auditoría." : "."}</p>}
        {e.EMAIL_PROVIDER === "dev" && <p className="notice notice-warn"><strong>Correo en modo desarrollo:</strong> no se envía ningún correo real. Los mensajes se ven en el buzón de desarrollo.</p>}
        {e.STORAGE_DRIVER === "local" && <p className="notice notice-warn"><strong>Almacenamiento local de desarrollo</strong> (no apto para producción; el cifrado en reposo depende del disco del servidor).</p>}
        {counts.legal_unreviewed > 0 && <p className="notice notice-warn"><strong>{counts.legal_unreviewed} texto(s) legal(es) activos sin revisión jurídica.</strong> <Link href="/admin/legal">Revisar</Link></p>}
        {!chain.ok && <p className="notice notice-danger"><strong>La verificación de la cadena de aceptaciones ha fallado</strong> en {chain.broken.length} registro(s). Investigar.</p>}
        {stale.length > 0 && <p className="notice notice-warn">{stale.length} copia(s) expurgada(s) basadas en una versión anterior del original: {stale.map((x) => x.title).join(", ")}</p>}
        {!health.ok && <p className="notice notice-danger">Comprobación de almacenamiento: {JSON.stringify(health.details)}</p>}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {card("Invitaciones pendientes", counts.invited, "/admin/recipients")}
        {card("Destinatarios activos", counts.active, "/admin/recipients")}
        {card("NDA aceptados", counts.accepted, "/admin/activity")}
        {card("Revocados", counts.revoked, "/admin/recipients")}
        {card("Documentos publicados", counts.published, "/admin/library")}
        {card("Versiones en revisión", counts.in_pipeline, "/admin/library?status=review")}
        {card("Conversiones fallidas", counts.failed, "/admin/library?status=failed")}
        {card("En cuarentena antivirus", counts.quarantined, "/admin/library?status=quarantine")}
        {card("Documentación pendiente", counts.pending_items, "/admin/checklist")}
        {card("Preguntas abiertas", counts.open_questions, "/admin/qa")}
      </div>
      <section className="card">
        <div className="flex items-center"><h2 className="flex-1">Notificaciones</h2><form action={markNotificationsReadAction}><button className="btn btn-secondary btn-sm">Marcar como leídas</button></form></div>
        <p className="text-xs text-muted">Sin contenido confidencial. Configurables en Configuración.</p>
        <ul className="text-sm mt-2 space-y-1">
          {notes.map((n, i) => <li key={i} className={n.read_at ? "text-muted" : "font-semibold"}>{fmtDateTime(n.created_at)} — {n.kind} — {n.payload?.name ?? n.payload?.error ?? ""}</li>)}
          {!notes.length && <li className="text-muted">Sin notificaciones.</li>}
        </ul>
      </section>
      <p className="text-xs text-muted">Cadena de aceptaciones verificada: {chain.checked} registro(s) {chain.ok ? "✓" : "✗"}. Almacenamiento: {health.details.driver}.</p>
    </div>
  );
}
