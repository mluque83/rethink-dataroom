import type { Document } from "@/server/db/schema";

type Sec = { id: string; code: string; nameEs: string };
type Fol = { id: string; sectionId: string; name: string };

export function DocMetaFields({ sections, folders, d }: { sections: Sec[]; folders: Fol[]; d?: Partial<Document> }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <div className="md:col-span-2"><label className="lbl" htmlFor="title">Título *</label><input id="title" name="title" required defaultValue={d?.title} className="input" maxLength={300} /></div>
      <div><label className="lbl" htmlFor="sectionId">Categoría *</label>
        <select id="sectionId" name="sectionId" required defaultValue={d?.sectionId} className="input">{sections.map((s) => <option key={s.id} value={s.id}>{s.code}. {s.nameEs}</option>)}</select></div>
      <div><label className="lbl" htmlFor="folderId">Carpeta</label>
        <select id="folderId" name="folderId" defaultValue={d?.folderId ?? ""} className="input"><option value="">—</option>{folders.map((f) => <option key={f.id} value={f.id}>{sections.find((s) => s.id === f.sectionId)?.code} / {f.name}</option>)}</select></div>
      <div><label className="lbl" htmlFor="product">Producto</label>
        <select id="product" name="product" defaultValue={d?.product ?? ""} className="input"><option value="">—</option><option>T-Control®</option><option>T-Control® Easy In</option><option>Corporativo</option><option>Varios</option></select></div>
      <div><label className="lbl" htmlFor="market">Mercado</label><input id="market" name="market" defaultValue={d?.market ?? ""} className="input" placeholder="p. ej. UE, ES, EE. UU." /></div>
      <div><label className="lbl" htmlFor="documentDate">Fecha del documento</label><input id="documentDate" name="documentDate" type="date" defaultValue={d?.documentDate ?? ""} className="input" /></div>
      <div><label className="lbl" htmlFor="ownerName">Responsable</label><input id="ownerName" name="ownerName" defaultValue={d?.ownerName ?? ""} className="input" /></div>
      <div><label className="lbl" htmlFor="confidentiality">Confidencialidad</label>
        <select id="confidentiality" name="confidentiality" defaultValue={d?.confidentiality ?? "confidential"} className="input"><option value="internal">Interno</option><option value="confidential">Confidencial</option><option value="highly_confidential">Altamente confidencial</option></select></div>
      <div><label className="lbl" htmlFor="validityStatus">Estado de vigencia</label>
        <select id="validityStatus" name="validityStatus" defaultValue={d?.validityStatus ?? "pending_verification"} className="input">
          <option value="pending_verification">Pendiente de verificar</option><option value="valid">Vigente (verificado)</option><option value="expired">Caducado</option><option value="superseded">Sustituido</option><option value="not_applicable">No aplica</option></select></div>
      <div><label className="lbl" htmlFor="validUntil">Vigente hasta</label><input id="validUntil" name="validUntil" type="date" defaultValue={d?.validUntil ?? ""} className="input" /></div>
      <div><label className="lbl" htmlFor="nextReviewAt">Próxima revisión</label><input id="nextReviewAt" name="nextReviewAt" type="date" defaultValue={d?.nextReviewAt ?? ""} className="input" /></div>
      <div><label className="lbl" htmlFor="tags">Etiquetas (separadas por comas)</label><input id="tags" name="tags" defaultValue={(d?.tags ?? []).join(", ")} className="input" /></div>
      <div className="md:col-span-2"><label className="lbl" htmlFor="source">Fuente</label><input id="source" name="source" defaultValue={d?.source ?? ""} className="input" /></div>
      <div className="md:col-span-3"><label className="lbl" htmlFor="notes">Observaciones</label><textarea id="notes" name="notes" defaultValue={d?.notes ?? ""} className="input" rows={2} /></div>
      <label className="md:col-span-3 flex gap-2 text-sm"><input type="checkbox" name="containsPatientData" defaultChecked={!!d?.containsPatientData} />
        Contiene datos identificativos de pacientes → nunca publicable (bloqueado también en base de datos). Publique una copia expurgada verificada.</label>
    </div>
  );
}
