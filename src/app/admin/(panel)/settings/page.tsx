import { env } from "@/server/env";
import { getSetting } from "@/server/settings";
import { storage } from "@/server/storage";
import { clamdScan } from "@/server/documents/scan";
import { Flash } from "@/components/Flash";
import { settingsAction, retentionAction } from "../actions";

function H({ k }: { k: string }) { return <input type="hidden" name="key" value={k} />; }

export default async function Settings({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const [wm, tr, rt, nt, inv] = await Promise.all([getSetting("watermark"), getSetting("tracking"), getSetting("retention"), getSetting("notifications"), getSetting("invitations")]);
  const e = env();
  const health: { ok: boolean; details: Record<string, string> } = await storage().health().catch((x) => ({ ok: false, details: { error: (x as Error).message } }));
  const scan = e.SCANNER === "clamav" ? await clamdScan(Buffer.from("health-check"), e.CLAMD_HOST, e.CLAMD_PORT, 5000) : null;
  return (
    <div className="space-y-4">
      <h1>Configuración</h1>
      <Flash searchParams={searchParams} />
      <section className="card space-y-1 text-sm"><h2>Estado del sistema</h2>
        <p>Entorno: <strong>{e.APP_ENV}</strong> · URL: {e.APP_URL} · zona horaria de visualización: {e.APP_TIMEZONE} (eventos en UTC)</p>
        <p>Almacenamiento: {Object.entries(health.details).map(([k, v]) => `${k}=${v}`).join(" · ")} {health.ok ? "✓" : "⚠"}</p>
        <p>Antivirus: {e.SCANNER === "none" ? "NO CONFIGURADO — las cargas quedan en cuarentena" : `clamd ${e.CLAMD_HOST}:${e.CLAMD_PORT} → ${scan?.status} (${scan?.detail})`}</p>
        <p>Correo: {e.EMAIL_PROVIDER === "dev" ? "modo desarrollo (sin envíos reales)" : `SMTP ${e.SMTP_HOST}`}</p>
        <p>Conversión: sandbox={e.CONVERTER_SANDBOX}, timeout={e.CONVERTER_TIMEOUT_SECONDS}s, memoria={e.CONVERTER_MEMORY_MB} MB · carga máx. {e.UPLOAD_MAX_MB} MB · cuota {e.STORAGE_QUOTA_GB} GB</p>
        <p className="text-xs text-muted">Los secretos no se muestran nunca. Se gestionan en variables de entorno / gestor de secretos.</p></section>

      <form action={settingsAction} className="card space-y-2"><H k="watermark" /><h2>Marca de agua</h2>
        <label className="lbl" htmlFor="op">Opacidad (0.08–0.35)</label><input id="op" name="opacity" type="number" step="0.01" min="0.08" max="0.35" defaultValue={wm.opacity} className="input max-w-[8rem]" />
        <p className="text-xs text-muted">Texto fijo: «RETHINK MEDICAL — CONFIDENTIAL», nombre y correo verificado, identificador de acceso y fecha UTC. Nunca incluye tokens ni secretos. Cambiarla invalida las cachés derivadas.</p>
        <button className="btn btn-sm">Guardar</button></form>

      <form action={settingsAction} className="card space-y-2"><H k="tracking" /><h2>Seguimiento</h2>
        <label className="text-sm"><input type="checkbox" name="detailedMetricsEnabled" defaultChecked={tr.detailedMetricsEnabled} /> Métricas opcionales (páginas servidas y tiempo activo estimado). Los registros de acceso, descargas y seguridad se mantienen siempre.</label>
        <div className="grid md:grid-cols-3 gap-2">
          <div><label className="lbl" htmlFor="hb">Latido (s)</label><input id="hb" name="heartbeatSeconds" type="number" min={5} max={60} defaultValue={tr.heartbeatSeconds} className="input" /></div>
          <div><label className="lbl" htmlFor="idle">Umbral de inactividad (s)</label><input id="idle" name="idleSeconds" type="number" min={15} max={600} defaultValue={tr.idleSeconds} className="input" /></div>
          <div><label className="lbl" htmlFor="mc">Crédito máximo por intervalo (s)</label><input id="mc" name="maxCreditSeconds" type="number" min={5} max={120} defaultValue={tr.maxCreditSeconds} className="input" /></div></div>
        <button className="btn btn-sm">Guardar</button></form>

      <form action={settingsAction} className="card space-y-2"><H k="notifications" /><h2>Notificaciones a administradores</h2>
        <div className="text-sm flex flex-wrap gap-4"><label><input type="checkbox" name="firstVisit" defaultChecked={nt.firstVisit} /> Primera visita</label><label><input type="checkbox" name="ndaAccepted" defaultChecked={nt.ndaAccepted} /> Aceptación del NDA</label>
          <label><input type="checkbox" name="accessRequest" defaultChecked={nt.accessRequest} /> Solicitudes de acceso</label><label><input type="checkbox" name="questionCreated" defaultChecked={nt.questionCreated} /> Nuevas preguntas</label></div>
        <label className="lbl" htmlFor="em">Enviar también por correo a (opcional; los correos no contienen información confidencial)</label><input id="em" name="emailTo" defaultValue={nt.emailTo.join(", ")} className="input" />
        <button className="btn btn-sm">Guardar</button></form>

      <form action={settingsAction} className="card space-y-2"><H k="invitations" /><h2>Invitaciones</h2>
        <label className="lbl" htmlFor="ex">Validez del enlace de invitación (días)</label><input id="ex" name="expiryDays" type="number" min={1} max={60} defaultValue={inv.expiryDays} className="input max-w-[8rem]" />
        <p className="text-xs text-muted">Códigos de un solo uso: 10 min, 5 intentos, reenvío con espera de 45 s y límites por correo e IP. No se usan URL prefirmadas de almacenamiento: todo el contenido pasa por el servidor, con autorización en cada petición.</p>
        <button className="btn btn-sm">Guardar</button></form>

      <section className="card space-y-2"><h2>Conservación</h2>
        <form action={settingsAction} className="space-y-2"><H k="retention" />
          <div className="grid md:grid-cols-2 gap-2"><div><label className="lbl" htmlFor="am">Actividad: anonimizar tras (meses)</label><input id="am" name="activityMonths" type="number" min={1} max={120} defaultValue={rt.activityMonths} className="input" /></div>
            <div><label className="lbl" htmlFor="sm">Seguridad: borrar tras (meses)</label><input id="sm" name="securityMonths" type="number" min={1} max={120} defaultValue={rt.securityMonths} className="input" /></div></div>
          <label className="lbl" htmlFor="cn">Evidencia contractual</label><input id="cn" name="contractualNote" defaultValue={rt.contractualNote} className="input" />
          <button className="btn btn-sm">Guardar</button></form>
        <div className="flex gap-2"><form action={retentionAction}><input type="hidden" name="mode" value="dry" /><button className="btn btn-secondary btn-sm">Simular aplicación</button></form>
          <form action={retentionAction}><input type="hidden" name="mode" value="apply" /><button className="btn btn-danger btn-sm">Aplicar política ahora</button></form></div>
        <p className="text-xs text-muted">Las aceptaciones e identidades declaradas nunca se borran por este proceso (protegidas en base de datos).</p></section>
    </div>
  );
}
