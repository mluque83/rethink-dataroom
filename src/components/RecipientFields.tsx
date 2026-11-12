import type { Recipient } from "@/server/db/schema";

const toLocal = (d: Date | null | undefined) => (d ? new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");

export function RecipientFields({ r, orgs, ndas, groups, memberOf }: {
  r?: Partial<Recipient>; orgs: { id: string; name: string }[]; ndas: { id: string; title: string }[]; groups: { id: string; name: string }[]; memberOf: string[];
}) {
  return (
    <div className="grid md:grid-cols-3 gap-3">
      {!r?.id && <div><label className="lbl" htmlFor="email">Correo autorizado *</label><input id="email" name="email" type="email" required className="input" /></div>}
      <div><label className="lbl" htmlFor="displayName">Nombre *</label><input id="displayName" name="displayName" required defaultValue={r?.displayName} className="input" /></div>
      <div><label className="lbl" htmlFor="roleTitle">Cargo</label><input id="roleTitle" name="roleTitle" defaultValue={r?.roleTitle ?? ""} className="input" /></div>
      <div><label className="lbl" htmlFor="organizationId">Organización</label><select id="organizationId" name="organizationId" defaultValue={r?.organizationId ?? ""} className="input"><option value="">—</option>{orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
      <div><label className="lbl" htmlFor="ndaTextId">NDA aplicable *</label><select id="ndaTextId" name="ndaTextId" required defaultValue={r?.ndaTextId} className="input">{ndas.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></div>
      <div><label className="lbl" htmlFor="locale">Idioma</label><select id="locale" name="locale" defaultValue={r?.locale ?? "es"} className="input"><option value="es">Español</option><option value="en">English</option></select></div>
      <div><label className="lbl" htmlFor="accessStartsAt">Inicio de acceso (opcional; hora del navegador)</label><input id="accessStartsAt" name="accessStartsAt" type="datetime-local" defaultValue={toLocal(r?.accessStartsAt)} className="input" /></div>
      <div><label className="lbl" htmlFor="accessExpiresAt">Caducidad del acceso</label><input id="accessExpiresAt" name="accessExpiresAt" type="datetime-local" defaultValue={toLocal(r?.accessExpiresAt)} className="input" /></div>
      <div><label className="lbl" htmlFor="sessionMaxHours">Re-verificación del correo cada (horas)</label><input id="sessionMaxHours" name="sessionMaxHours" type="number" min={1} max={168} defaultValue={r?.sessionMaxHours ?? 12} className="input" /></div>
      <fieldset className="md:col-span-3 text-sm"><legend className="lbl">Interruptores del destinatario (además de las reglas)</legend>
        <label className="mr-4"><input type="checkbox" name="qaEnabled" defaultChecked={!!r?.qaEnabled} /> Preguntas y respuestas</label>
        <label className="mr-4"><input type="checkbox" name="allowWatermarkedDownloads" defaultChecked={!!r?.allowWatermarkedDownloads} /> Descargas con marca de agua</label>
        <label><input type="checkbox" name="allowOriginalDownloads" defaultChecked={!!r?.allowOriginalDownloads} /> Descarga de ORIGINALES (desaconsejado; sin marca)</label></fieldset>
      <fieldset className="md:col-span-3 text-sm"><legend className="lbl">Grupos</legend>
        {groups.map((g) => <label key={g.id} className="mr-4"><input type="checkbox" name="groupIds" value={g.id} defaultChecked={memberOf.includes(g.id)} /> {g.name}</label>)}
        {!groups.length && <span className="text-muted">No hay grupos.</span>}</fieldset>
    </div>
  );
}
