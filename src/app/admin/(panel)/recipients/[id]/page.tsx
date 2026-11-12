import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { isUuid, loadLibrary, loadSubject, visibleDocuments } from "@/server/permissions";
import { requiredLegalVersions } from "@/server/recipient-state";
import { acceptancesOf } from "@/server/legal";
import { getSetting } from "@/server/settings";
import { recipientSummaries } from "@/server/analytics";
import { RecipientFields } from "@/components/RecipientFields";
import { RulesEditor } from "@/components/RulesEditor";
import { Badge, Flash } from "@/components/Flash";
import { fmtDateTime, fmtDuration, fmtUtc } from "@/lib/format";
import { updateRecipientAction, inviteAction, recipientStateAction, applyProfileAction } from "../../actions";

export default async function RecipientPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = db();
  const r = await d.query.recipients.findFirst({ where: eq(schema.recipients.id, id) });
  if (!r) notFound();
  const [orgs, ndas, groups, profiles, memberships, invitations] = await Promise.all([
    d.select().from(schema.organizations), d.select().from(schema.legalTexts).where(eq(schema.legalTexts.kind, "nda")), d.select().from(schema.groups),
    d.select().from(schema.accessProfiles), d.select().from(schema.groupMembers).where(eq(schema.groupMembers.recipientId, id)),
    d.select().from(schema.invitations).where(eq(schema.invitations.recipientId, id)).orderBy(desc(schema.invitations.createdAt)),
  ]);
  const subject = (await loadSubject(id))!;
  const lib = await loadLibrary();
  const visible = visibleDocuments(subject, lib);
  const ownRules = subject.rules.filter((x) => x.recipientId === id);
  const groupRules = subject.rules.filter((x) => x.groupId);
  const denies = subject.rules.filter((x) => x.effect === "deny");
  const legal = await requiredLegalVersions(r);
  const ndaText = ndas.find((n) => n.id === r.ndaTextId);
  const acc = await acceptancesOf(id);
  const inv = await getSetting("invitations");
  const [stats] = await recipientSummaries({ recipientId: id });
  const onceUrl = (await cookies()).get("rmdr_inv_once")?.value;
  const secName = (sid: string) => { const s = lib.sections.find((x) => x.id === sid); return s ? `${s.code}. ${s.nameEs}` : ""; };
  const sessions = await d.select().from(schema.session).where(eq(schema.session.userId, r.userId));
  const lastAudit = await d.select().from(schema.auditEvents).where(and(eq(schema.auditEvents.targetType, "recipient"), eq(schema.auditEvents.targetId, id))).orderBy(desc(schema.auditEvents.at)).limit(20);

  return (
    <div className="space-y-4">
      <Link href="/admin/recipients" className="text-sm">← Destinatarios</Link>
      <div className="flex flex-wrap items-center gap-2"><h1 className="flex-1">{r.displayName}</h1><Badge v={r.status} />{r.isDemo && <span className="badge badge-demo">DEMO</span>}
        <span className="badge" title="Identificador no secreto impreso en la marca de agua">{r.accessCode}</span></div>
      <Flash searchParams={searchParams} />
      {onceUrl && <div className="notice notice-warn" data-testid="invite-url"><strong>Enlace de invitación (se muestra una sola vez):</strong> <code className="break-all">{onceUrl}</code><br />
        <span className="text-xs">El enlace por sí solo no da acceso: exige verificar el correo {r.email} con un código. No lo publique en canales abiertos.</span></div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <section className="card lg:col-span-2 space-y-2">
          <h2>Resumen previo a la invitación</h2>
          <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="font-semibold">Correo autorizado</dt><dd>{r.email}</dd>
            <dt className="font-semibold">Contenido permitido</dt><dd>{visible.length} documento(s) publicados visibles: {visible.map((v) => `${v.doc.ref} ${v.doc.title}`).join(" · ") || "ninguno"}</dd>
            <dt className="font-semibold">Restricciones</dt><dd>{denies.length ? `${denies.length} regla(s) de denegación aplicables (individuales o de grupo)` : "ninguna"}</dd>
            <dt className="font-semibold">Descargas</dt><dd>Con marca: {r.allowWatermarkedDownloads ? `habilitadas (${visible.filter((v) => v.caps.downloadWatermarked).length} doc.)` : "no"} · Originales: {r.allowOriginalDownloads ? `SÍ (${visible.filter((v) => v.caps.downloadOriginal).length} doc.)` : "no"}</dd>
            <dt className="font-semibold">Q&A</dt><dd>{r.qaEnabled ? "habilitado" : "no"}</dd>
            <dt className="font-semibold">NDA aplicable</dt><dd>{ndaText?.title} — {legal.nda ? <>versión {legal.nda.versionLabel} <Badge v={legal.nda.legalReviewStatus} /></> : <span className="text-danger">SIN VERSIÓN ACTIVA (el acceso quedará bloqueado)</span>}</dd>
            <dt className="font-semibold">Vigencia del acceso</dt><dd>{r.accessStartsAt ? `desde ${fmtDateTime(r.accessStartsAt)} ` : ""}{r.accessExpiresAt ? `hasta ${fmtDateTime(r.accessExpiresAt)}` : "sin caducidad configurada"} · enlace de invitación válido {inv.expiryDays} días · re-verificación cada {r.sessionMaxHours} h</dd>
          </dl>
          <div className="flex flex-wrap gap-4 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/admin/watermark-sample?r=${r.id}`} alt="Ejemplo de marca de agua personalizada" className="w-64 border border-line" />
            <div className="space-y-2 flex-1 min-w-[16rem]">
              <Link className="btn btn-secondary" href={`/admin/recipients/${r.id}/preview`}>Ver como este destinatario</Link>
              {!["revoked", "suspended"].includes(r.status) && (
                <form action={inviteAction} className="space-y-2 notice">
                  <input type="hidden" name="recipientId" value={r.id} />
                  <label className="flex gap-2 text-sm"><input type="checkbox" name="confirmSummary" required /> He revisado contenido, restricciones, descargas, NDA, caducidad y marca de agua.</label>
                  <div className="flex gap-2 flex-wrap">
                    <button className="btn" name="mode" value="send">{invitations.length ? "Generar y enviar nueva invitación" : "Generar y enviar invitación"}</button>
                    <button className="btn btn-secondary" name="mode" value="create">Solo generar enlace</button></div>
                  <p className="text-xs text-muted">Una nueva invitación anula los enlaces pendientes anteriores.</p>
                </form>)}
            </div>
          </div>
        </section>

        <section className="card space-y-2">
          <h2>Estado y actividad</h2>
          <ul className="text-sm space-y-1">
            <li>Invitación: <Badge v={invitations[0]?.status} /> {invitations[0] && <span className="text-xs">enviada {fmtDateTime(invitations[0].sentAt)} · caduca {fmtDateTime(invitations[0].expiresAt)}</span>}</li>
            <li>NDA aceptado: {acc[0] ? fmtDateTime(acc[0].acceptedAt) : "no"}</li>
            <li>Primera / última visita: {fmtDateTime(stats?.first_visit)} / {fmtDateTime(stats?.last_visit)}</li>
            <li>Sesiones autenticadas: {stats?.sessions ?? 0} · abiertas ahora: {sessions.filter((s) => s.expiresAt > new Date()).length}</li>
            <li>Documentos abiertos: {stats?.docs_opened ?? 0} · descargas: {stats?.downloads ?? 0}</li>
            <li>Tiempo activo estimado: {fmtDuration(stats?.active_ms ?? 0)}</li>
          </ul>
          <Link href={`/admin/activity/${r.id}`} className="text-sm">Ver cronología y detalle →</Link>
          <div className="border-t border-line pt-2 space-y-2">
            <form action={recipientStateAction}><input type="hidden" name="recipientId" value={r.id} /><input type="hidden" name="op" value="close_sessions" /><button className="btn btn-secondary btn-sm">Cerrar sesiones abiertas</button></form>
            {r.status !== "revoked" ? (
              <form action={recipientStateAction} className="space-y-1"><input type="hidden" name="recipientId" value={r.id} /><input type="hidden" name="op" value="revoke" />
                <input name="reason" placeholder="Motivo" className="input" /><button className="btn btn-danger btn-sm">Revocar acceso y cerrar sesiones</button>
                <p className="text-xs text-muted">Revocar bloquea nuevos accesos. No elimina copias ya descargadas ni la información ya vista.</p></form>
            ) : (
              <form action={recipientStateAction}><input type="hidden" name="recipientId" value={r.id} /><input type="hidden" name="op" value="reinstate" /><button className="btn btn-secondary btn-sm">Restablecer (requerirá nueva invitación)</button></form>)}
          </div>
          {acc.length > 0 && <a className="text-sm block" href={`/api/admin/export?type=acceptances&recipientId=${r.id}`}>Exportar expediente de aceptación (JSON)</a>}
        </section>
      </div>

      <section className="card space-y-2">
        <h2>Permisos individuales</h2>
        <RulesEditor subjectType="recipient" subjectId={r.id} rules={ownRules} returnTo={`/admin/recipients/${r.id}`} />
        <form action={applyProfileAction} className="flex gap-2 items-end"><input type="hidden" name="recipientId" value={r.id} />
          <div><label className="lbl" htmlFor="pf">Aplicar perfil (añade reglas individuales)</label><select id="pf" name="profileId" className="input">{profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <button className="btn btn-secondary btn-sm">Aplicar</button></form>
        {groupRules.length > 0 && <p className="text-sm">Reglas heredadas de grupos: {groupRules.length} ({groupRules.map((g) => `${g.effect} ${g.targetType === "section" ? secName(g.sectionId!) : g.targetType}`).join("; ")}). Se editan en <Link href="/admin/groups">Grupos</Link>.</p>}
      </section>

      <section className="card">
        <h2>Permisos efectivos (calculados en servidor)</h2>
        <div className="table-wrap"><table className="tbl"><thead><tr><th>Documento</th><th>Sección</th><th>Versión</th><th>Consulta</th><th>Descarga marca</th><th>Original</th></tr></thead><tbody>
          {visible.map((v) => <tr key={v.doc.id}><td>{v.doc.ref} {v.doc.title}</td><td className="text-sm">{secName(v.doc.sectionId)}</td><td>v{v.version.versionNumber}{v.olderVersions.length ? ` (+${v.olderVersions.length} ant.)` : ""}</td>
            <td>✓</td><td>{v.caps.downloadWatermarked ? "✓" : ""}</td><td>{v.caps.downloadOriginal ? "✓" : ""}</td></tr>)}
          {!visible.length && <tr><td colSpan={6} className="text-muted">No ve ningún documento.</td></tr>}
        </tbody></table></div>
      </section>

      <details className="card"><summary className="font-semibold cursor-pointer">Datos del destinatario</summary>
        <form action={updateRecipientAction} className="space-y-3 mt-3"><input type="hidden" name="recipientId" value={r.id} />
          <RecipientFields r={r} orgs={orgs} ndas={ndas} groups={groups} memberOf={memberships.map((m) => m.groupId)} />
          <div><label className="lbl" htmlFor="internalNotes">Notas internas (no visibles para el destinatario)</label><textarea id="internalNotes" name="internalNotes" defaultValue={r.internalNotes ?? ""} className="input" rows={2} /></div>
          <button className="btn">Guardar</button></form></details>

      <section className="card"><h2>Aceptaciones</h2>
        <ul className="text-sm">{acc.map((a) => <li key={a.id}>{fmtUtc(a.acceptedAt)} — {a.declaredFullName} ({a.actingCapacity}{a.representedEntity ? `: ${a.representedEntity}` : ""}) · texto {a.displayedTextSha256.slice(0, 12)}… · registro {a.recordHash.slice(0, 12)}…</li>)}
          {!acc.length && <li className="text-muted">Ninguna.</li>}</ul></section>

      <section className="card"><h2>Auditoría del destinatario</h2>
        <ul className="text-xs">{lastAudit.map((a) => <li key={a.id}>{fmtDateTime(a.at)} — {a.action}</li>)}</ul></section>
    </div>
  );
}
