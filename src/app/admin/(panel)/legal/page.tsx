import { desc } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { Badge, Flash } from "@/components/Flash";
import { fmtDateTime } from "@/lib/format";
import { legalAction } from "../actions";

export default async function Legal({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const d = db();
  const [texts, versions] = await Promise.all([d.select().from(schema.legalTexts), d.select().from(schema.legalTextVersions).orderBy(desc(schema.legalTextVersions.createdAt))]);
  const f = (op: string, id: string, label: string, cls = "btn btn-secondary btn-sm") => <form action={legalAction} className="inline"><input type="hidden" name="op" value={op} /><input type="hidden" name="versionId" value={id} /><button className={cls}>{label}</button></form>;
  return (
    <div className="space-y-4">
      <h1>Condiciones, NDA y aviso de privacidad</h1>
      <Flash searchParams={searchParams} />
      <p className="notice notice-warn text-sm">Los textos iniciales son BORRADORES pendientes de revisión jurídica. Una versión activa es inmutable; los cambios se hacen creando una versión nueva. Si se marca «cambio material», todos los destinatarios deberán aceptarla de nuevo antes de cualquier nuevo acceso. Se conservan todas las versiones y aceptaciones anteriores.</p>
      {texts.map((t) => (
        <section key={t.id} className="card space-y-2">
          <h2>{t.title} <span className="text-xs text-muted">({t.kind} · {t.key})</span></h2>
          {versions.filter((v) => v.legalTextId === t.id).map((v) => (
            <div key={v.id} className="border border-line rounded p-2 space-y-1">
              <div className="flex flex-wrap gap-2 items-center"><strong>{v.versionLabel}</strong><Badge v={v.status} /><Badge v={v.legalReviewStatus} />{v.requiresReacceptance && <span className="badge">cambio material</span>}
                <span className="text-xs text-muted">SHA-256 {v.bodySha256.slice(0, 16)}… · activada {fmtDateTime(v.activatedAt)}</span></div>
              {v.changeSummary && <p className="text-xs">{v.changeSummary}</p>}
              <details><summary className="text-sm cursor-pointer">Ver texto</summary><div className="legal-text text-xs max-h-80 overflow-auto">{v.body}</div></details>
              <div className="flex gap-2">{v.legalReviewStatus !== "legal_reviewed" && f("mark_reviewed", v.id, "Marcar revisado por asesoría jurídica")}
                {v.status === "draft" && f("activate", v.id, "Activar", "btn btn-sm")}{v.status === "draft" && f("delete_draft", v.id, "Eliminar borrador")}</div>
            </div>))}
          <details><summary className="text-sm cursor-pointer">Nueva versión</summary>
            <form action={legalAction} className="space-y-2 mt-2"><input type="hidden" name="op" value="new_version" /><input type="hidden" name="legalTextId" value={t.id} />
              <div className="grid md:grid-cols-3 gap-2"><input name="versionLabel" required placeholder="Etiqueta (p. ej. 1.0)" className="input" />
                <select name="language" className="input" defaultValue={t.key.endsWith("-en") ? "en" : "es"}><option value="es">es</option><option value="en">en</option></select>
                <input name="changeSummary" placeholder="Resumen del cambio" className="input" /></div>
              <textarea name="body" required rows={12} className="input font-mono text-xs" defaultValue={versions.find((v) => v.legalTextId === t.id)?.body} />
              <label className="text-sm"><input type="checkbox" name="requiresReacceptance" defaultChecked /> Cambio material: exigir nueva aceptación</label>
              <div><button className="btn btn-sm">Crear borrador</button></div></form></details>
        </section>))}
    </div>
  );
}
