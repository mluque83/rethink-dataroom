import { db, schema } from "@/server/db";
import { inArray } from "drizzle-orm";
import type { AccessRule } from "@/server/db/schema";
import { ruleAction } from "@/app/admin/(panel)/actions";

/** Edits the rules of ONE subject (recipient or group). Server-rendered forms; every change is audited. */
export async function RulesEditor({ subjectType, subjectId, rules, returnTo }: { subjectType: "recipient" | "group"; subjectId: string; rules: AccessRule[]; returnTo: string }) {
  const d = db();
  const [sections, folders, documents] = await Promise.all([
    d.select().from(schema.sections).orderBy(schema.sections.sortOrder), d.select().from(schema.folders), d.select().from(schema.documents).orderBy(schema.documents.ref),
  ]);
  const superseded = await d.select().from(schema.documentVersions).where(inArray(schema.documentVersions.status, ["superseded", "published"]));
  const label = (r: AccessRule) => r.targetType === "section" ? `Sección ${sections.find((s) => s.id === r.sectionId)?.code} ${sections.find((s) => s.id === r.sectionId)?.nameEs}`
    : r.targetType === "folder" ? `Carpeta ${folders.find((f) => f.id === r.folderId)?.name}`
    : r.targetType === "document" ? `Documento ${documents.find((x) => x.id === r.documentId)?.ref} ${documents.find((x) => x.id === r.documentId)?.title}`
    : (() => { const v = superseded.find((x) => x.id === r.versionId); const doc = documents.find((x) => x.id === v?.documentId); return `Versión v${v?.versionNumber} de ${doc?.ref} ${doc?.title}`; })();
  return (
    <div className="space-y-3">
      <div className="table-wrap"><table className="tbl"><thead><tr><th>Efecto</th><th>Objetivo</th><th>Consulta</th><th>Descarga marca</th><th>Descarga original</th><th>Nota</th><th /></tr></thead><tbody>
        {rules.map((r) => (
          <tr key={r.id}>
            <td><span className={`badge ${r.effect === "deny" ? "badge-danger" : "badge-ok"}`}>{r.effect === "deny" ? "DENEGAR" : "permitir"}</span></td>
            <td className="text-sm">{label(r)}</td><td>{r.canView ? "✓" : ""}</td><td>{r.canDownloadWatermarked ? "✓" : ""}</td><td>{r.canDownloadOriginal ? "✓" : ""}</td>
            <td className="text-xs">{r.note}</td>
            <td><form action={ruleAction}><input type="hidden" name="op" value="remove" /><input type="hidden" name="ruleId" value={r.id} /><input type="hidden" name="returnTo" value={returnTo} /><button className="btn btn-secondary btn-sm">Quitar</button></form></td>
          </tr>))}
        {!rules.length && <tr><td colSpan={7} className="text-muted">Sin reglas: denegación por defecto (no ve nada por esta vía).</td></tr>}
      </tbody></table></div>
      <form action={ruleAction} className="grid md:grid-cols-6 gap-2 items-end border-t border-line pt-3">
        <input type="hidden" name="subjectType" value={subjectType} /><input type="hidden" name="subjectId" value={subjectId} /><input type="hidden" name="returnTo" value={returnTo} />
        <div><label className="lbl" htmlFor={`eff-${subjectId}`}>Efecto</label><select id={`eff-${subjectId}`} name="effect" className="input"><option value="allow">Permitir</option><option value="deny">Denegar / restringir</option></select></div>
        <div className="md:col-span-2"><label className="lbl" htmlFor={`tgt-${subjectId}`}>Objetivo</label>
          <select id={`tgt-${subjectId}`} name="target" className="input" required>
            <optgroup label="Secciones">{sections.map((s) => <option key={s.id} value={`section:${s.id}`}>{s.code}. {s.nameEs}</option>)}</optgroup>
            {folders.length > 0 && <optgroup label="Carpetas">{folders.map((f) => <option key={f.id} value={`folder:${f.id}`}>{f.name}</option>)}</optgroup>}
            <optgroup label="Documentos">{documents.map((x) => <option key={x.id} value={`document:${x.id}`}>{x.ref} {x.title}</option>)}</optgroup>
            <optgroup label="Versiones concretas">{superseded.map((v) => { const doc = documents.find((x) => x.id === v.documentId); return <option key={v.id} value={`version:${v.id}`}>{doc?.ref} v{v.versionNumber} ({v.status})</option>; })}</optgroup>
          </select></div>
        <fieldset className="text-sm"><legend className="lbl">Capacidades</legend>
          <label className="block"><input type="checkbox" name="canView" defaultChecked /> Consulta</label>
          <label className="block"><input type="checkbox" name="canDownloadWatermarked" /> Descarga con marca</label>
          <label className="block"><input type="checkbox" name="canDownloadOriginal" /> Descarga original</label></fieldset>
        <div><label className="lbl" htmlFor={`note-${subjectId}`}>Nota</label><input id={`note-${subjectId}`} name="note" className="input" /></div>
        <button className="btn">Añadir regla</button>
      </form>
      <p className="text-xs text-muted">Precedencia: cualquier DENEGAR aplicable (individual o de grupo, a cualquier nivel) prevalece sobre cualquier permitir. En una regla de denegación, marque qué capacidades se deniegan (denegar «Consulta» oculta el documento por completo). Las descargas requieren además el interruptor del destinatario.</p>
    </div>
  );
}
