import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { versionsOf } from "@/server/documents/library";
import { audienceIfPublished } from "@/server/permissions";
import { Badge, Flash } from "@/components/Flash";
import { DocMetaFields } from "@/components/DocMetaFields";
import { fmtDateTime, fmtBytes } from "@/lib/format";
import {
  updateDocumentAction, uploadVersionAction, versionAction, publishAction, archiveAction,
  createRedactedCopyAction, verifyRedactionAction, attestRedactionAction,
} from "../../actions";

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const d = db();
  const doc = await d.query.documents.findFirst({ where: eq(schema.documents.id, id) }).catch(() => undefined);
  if (!doc) notFound();
  const [sections, folders, versions, recipients, groups] = await Promise.all([
    d.select().from(schema.sections).orderBy(schema.sections.sortOrder), d.select().from(schema.folders), versionsOf(id),
    d.select().from(schema.recipients).where(inArray(schema.recipients.status, ["draft", "invited", "active"])), d.select().from(schema.groups),
  ]);
  const files = versions.length ? await d.select().from(schema.files).where(inArray(schema.files.id, versions.map((v) => v.originalFileId))) : [];
  const audience = await audienceIfPublished(id);
  const checks = versions.length ? await d.select().from(schema.redactionChecks).where(inArray(schema.redactionChecks.redactedVersionId, versions.map((v) => v.id))).orderBy(desc(schema.redactionChecks.checkedAt)) : [];
  const redactedCopies = versions.length ? await d.select().from(schema.documents).where(inArray(schema.documents.redactedFromVersionId, versions.map((v) => v.id))) : [];
  const source = doc.redactedFromVersionId ? await d.query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, doc.redactedFromVersionId) }) : null;
  const history = await d.select().from(schema.auditEvents).where(or(and(eq(schema.auditEvents.targetType, "document"), eq(schema.auditEvents.targetId, id)),
    versions.length ? inArray(schema.auditEvents.targetId, versions.map((v) => v.id)) : eq(schema.auditEvents.targetId, "-"))).orderBy(desc(schema.auditEvents.at)).limit(60);
  const dev = env().DEV_ALLOW_UNSCANNED_RELEASE && env().APP_ENV !== "production";
  const op = (versionId: string, o: string, label: string, cls = "btn btn-secondary btn-sm", withNotes = false) => (
    <form action={versionAction} className="inline-flex gap-1"><input type="hidden" name="documentId" value={id} /><input type="hidden" name="versionId" value={versionId} /><input type="hidden" name="op" value={o} />
      {withNotes && <input name="notes" placeholder="Motivo / notas" className="input btn-sm w-40" required={o !== "approve"} />}<button className={cls}>{label}</button></form>);

  return (
    <div className="space-y-4">
      <Link href="/admin/library" className="text-sm">← Biblioteca</Link>
      <div className="flex flex-wrap items-center gap-2"><h1 className="flex-1">{doc.title}</h1><span className="badge">{doc.ref}</span>{doc.isDemo && <span className="badge badge-demo">DEMO</span>}
        {doc.kind === "redacted" && <span className="badge">Copia expurgada de versión {source?.versionNumber}</span>}</div>
      <Flash searchParams={searchParams} />
      {doc.containsPatientData && <p className="notice notice-danger">Marcado con datos identificativos de pacientes: no puede publicarse. Prepare una copia expurgada y verifíquela.</p>}

      <section className="card space-y-3">
        <h2>Versiones</h2>
        <p className="text-xs text-muted">Cada carga crea una versión nueva; nunca se sobrescribe. Una versión es privada hasta su aprobación y publicación expresas.</p>
        {versions.map((v) => {
          const f = files.find((x) => x.id === v.originalFileId);
          const rep = (v.conversionReport ?? {}) as { error?: string; fidelity?: { coverage: number; missingSample: string[] }; fidelityReasons?: string[]; validation?: { warnings: string[] }; uploadWarnings?: string[] };
          return (
            <div key={v.id} className="border border-line rounded-lg p-3 space-y-2" data-testid={`version-${v.versionNumber}`}>
              <div className="flex flex-wrap gap-2 items-center">
                <strong>v{v.versionNumber}</strong><Badge v={v.status} /> <span className="text-xs">Antivirus:</span><Badge v={v.scanStatus} /> <span className="text-xs">Fidelidad:</span><Badge v={v.fidelityStatus} />
                {v.fidelityConfirmedAt && <span className="badge badge-ok">fidelidad confirmada visualmente</span>}
                <span className="text-xs text-muted">{f?.originalFilename} · {f ? fmtBytes(f.sizeBytes) : ""} · {v.pageCount ?? "?"} pág. · cargada {fmtDateTime(v.uploadedAt)} · SHA-256 {f?.sha256.slice(0, 12)}…</span>
              </div>
              {v.changeSummary && <p className="text-sm">Cambios: {v.changeSummary}</p>}
              {v.scanDetail && <p className="text-xs text-muted">{v.scanDetail}</p>}
              {rep.error && <p className="notice notice-danger">Conversión fallida — publicación bloqueada: {rep.error}</p>}
              {(rep.fidelityReasons?.length ?? 0) > 0 && <p className="notice notice-warn text-sm">Revisar fidelidad: {rep.fidelityReasons!.join(", ")}{rep.fidelity && rep.fidelity.missingSample.length > 0 && ` · palabras ausentes en la representación: ${rep.fidelity.missingSample.join(", ")}`}. Compruebe visualmente las páginas (tablas, gráficos, hojas ocultas, comentarios) antes de confirmar.</p>}
              {[...(rep.uploadWarnings ?? []), ...(rep.validation?.warnings ?? [])].length > 0 && <p className="text-xs text-warn">Avisos de carga: {[...new Set([...(rep.uploadWarnings ?? []), ...(rep.validation?.warnings ?? [])])].join(", ")}</p>}
              {v.pageCount ? (
                <details><summary className="text-sm cursor-pointer">Revisar representación ({v.pageCount} pág.)</summary>
                  <div className="flex gap-2 overflow-x-auto py-2">{Array.from({ length: Math.min(v.pageCount, 30) }, (_, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <a key={i} href={`/api/admin/render?v=${v.id}&p=${i + 1}`} target="_blank"><img loading="lazy" src={`/api/admin/render?v=${v.id}&p=${i + 1}`} alt={`p${i + 1}`} className="h-64 border border-line" /></a>))}</div>
                </details>) : null}
              <div className="flex flex-wrap gap-2">
                {v.fidelityStatus === "warning" && !v.fidelityConfirmedAt && ["in_review", "approved"].includes(v.status) && op(v.id, "confirm_fidelity", "Confirmo fidelidad tras revisión visual")}
                {dev && v.scanStatus === "not_configured" && op(v.id, "release_unscanned", "Liberar SIN antivirus (solo desarrollo)", "btn btn-danger btn-sm")}
                {v.status === "in_review" && op(v.id, "approve", "Aprobar", "btn btn-sm", true)}
                {["in_review", "approved", "conversion_failed"].includes(v.status) && op(v.id, "reject", "Rechazar", "btn btn-secondary btn-sm", true)}
                {["conversion_failed", "uploaded"].includes(v.status) && op(v.id, "reprocess", "Reprocesar")}
                {["published", "superseded"].includes(v.status) && op(v.id, "withdraw", "Retirar", "btn btn-danger btn-sm", true)}
              </div>
              {v.status === "approved" && (
                <form action={publishAction} className="notice space-y-2" data-testid="publish-form">
                  <input type="hidden" name="documentId" value={id} /><input type="hidden" name="versionId" value={v.id} />
                  <h3>Publicar v{v.versionNumber}</h3>
                  <p className="text-sm">Con las reglas actuales, al publicar podrán verlo <strong>{audience.length}</strong> destinatario(s): {audience.map((a) => a.recipient.displayName).join(", ") || "nadie"}.
                    {versions.some((x) => x.status === "published") && " Sustituirá a la versión publicada actual para todos ellos."}</p>
                  <div className="grid md:grid-cols-2 gap-2 text-sm">
                    <fieldset><legend className="lbl">Conceder además a destinatarios (regla a nivel de documento)</legend>
                      {recipients.map((r) => <label key={r.id} className="block"><input type="checkbox" name="grantRecipient" value={r.id} /> {r.displayName} ({r.email})</label>)}</fieldset>
                    <fieldset><legend className="lbl">Conceder además a grupos</legend>
                      {groups.map((g) => <label key={g.id} className="block"><input type="checkbox" name="grantGroup" value={g.id} /> {g.name}</label>)}
                      <label className="block mt-2"><input type="checkbox" name="grantDownloadWm" /> con descarga con marca de agua (si el destinatario la tiene habilitada)</label></fieldset>
                  </div>
                  <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmAudience" required /> He revisado la audiencia y quiero publicar esta versión.</label>
                  <button className="btn">Publicar</button>
                </form>)}
              {doc.kind === "redacted" && v.pageCount && (
                <div className="border-t border-line pt-2 space-y-2">
                  <h3>Verificación de expurgación</h3>
                  <form action={verifyRedactionAction} className="space-y-2"><input type="hidden" name="documentId" value={id} /><input type="hidden" name="versionId" value={v.id} />
                    <label className="lbl" htmlFor={`terms-${v.id}`}>Textos que NO deben aparecer (uno por línea). Se usan en memoria y no se guardan.</label>
                    <textarea id={`terms-${v.id}`} name="terms" rows={4} required className="input" autoComplete="off" />
                    <button className="btn btn-secondary btn-sm">Verificar (texto, OCR, metadatos, anotaciones, adjuntos, partes ocultas)</button></form>
                  {checks.filter((c) => c.redactedVersionId === v.id).map((c) => (
                    <div key={c.id} className="text-sm space-y-1">
                      <div>{fmtDateTime(c.checkedAt)} — <Badge v={c.result} /> ({c.termsCount} términos) {c.attestedAt && <span className="badge badge-ok">atestado</span>}</div>
                      <ul className="text-xs">{(c.checks as { name: string; status: string; foundTermIndexes: number[]; note?: string }[]).map((k) => <li key={k.name}>{k.name}: <Badge v={k.status} /> {k.foundTermIndexes.length ? `términos nº ${k.foundTermIndexes.map((i) => i + 1).join(", ")}` : ""} {k.note}</li>)}</ul>
                      {c.result === "pass" && !c.attestedAt && <form action={attestRedactionAction} className="flex gap-2"><input type="hidden" name="documentId" value={id} /><input type="hidden" name="checkId" value={c.id} />
                        <input name="attestation" required minLength={10} className="input" placeholder="Atestación: he revisado visualmente todas las páginas y confirmo que…" /><button className="btn btn-sm">Atestar</button></form>}
                    </div>))}
                </div>)}
            </div>);
        })}
        <form action={uploadVersionAction} className="flex flex-wrap gap-2 items-end border-t border-line pt-3">
          <input type="hidden" name="documentId" value={id} />
          <div><label className="lbl" htmlFor="nv-file">Nueva versión (sustitución)</label><input id="nv-file" name="file" type="file" required className="input" accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg" /></div>
          <div className="flex-1 min-w-[12rem]"><label className="lbl" htmlFor="nv-sum">Resumen de cambios</label><input id="nv-sum" name="changeSummary" className="input" /></div>
          <button className="btn btn-secondary">Cargar versión (queda privada)</button>
        </form>
      </section>

      {doc.kind === "standard" && versions.length > 0 && (
        <section className="card space-y-2">
          <h2>Copias expurgadas</h2>
          <p className="text-xs text-muted">Prepare la copia fuera del sistema con una herramienta de expurgación real (no rectángulos superpuestos). Aquí se carga, se verifica automáticamente y se atesta manualmente. Actualizar el original no sustituye la copia publicada.</p>
          <ul className="text-sm">{redactedCopies.map((c) => <li key={c.id}><Link href={`/admin/documents/${c.id}`}>{c.title}</Link> ({c.ref}) — basada en v{versions.find((v) => v.id === c.redactedFromVersionId)?.versionNumber}</li>)}</ul>
          <form action={createRedactedCopyAction} className="flex flex-wrap gap-2 items-end"><input type="hidden" name="documentId" value={id} />
            <div><label className="lbl" htmlFor="rc-v">Versión original</label><select id="rc-v" name="sourceVersionId" className="input">{versions.map((v) => <option key={v.id} value={v.id}>v{v.versionNumber}</option>)}</select></div>
            <div><label className="lbl" htmlFor="rc-f">Archivo expurgado</label><input id="rc-f" name="file" type="file" required className="input" /></div>
            <div className="flex-1"><label className="lbl" htmlFor="rc-n">Qué se ha eliminado (descripción, sin copiar el contenido)</label><input id="rc-n" name="notes" className="input" /></div>
            <button className="btn btn-secondary">Cargar copia expurgada</button></form>
        </section>)}

      <details className="card"><summary className="font-semibold cursor-pointer">Metadatos</summary>
        <form action={updateDocumentAction} className="space-y-3 mt-3"><input type="hidden" name="documentId" value={id} />
          <DocMetaFields sections={sections} folders={folders} d={doc} /><button className="btn">Guardar metadatos</button></form>
        <form action={archiveAction} className="mt-3"><input type="hidden" name="documentId" value={id} /><input type="hidden" name="archived" value={doc.archivedAt ? "0" : "1"} />
          <button className="btn btn-secondary btn-sm">{doc.archivedAt ? "Desarchivar" : "Archivar (deja de ser visible para todos)"}</button></form>
      </details>

      <section className="card"><h2>Historial de cambios</h2>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Fecha</th><th>Acción</th><th>Detalle</th></tr></thead><tbody>
          {history.map((h) => <tr key={h.id}><td className="text-xs whitespace-nowrap">{fmtDateTime(h.at)}</td><td>{h.action}</td><td className="text-xs break-all">{JSON.stringify(h.details)?.slice(0, 300)}</td></tr>)}
        </tbody></table></div></section>
    </div>
  );
}
