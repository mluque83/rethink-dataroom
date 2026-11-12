export function ActivityFilters({ sp, recipients, documents, hidePerson }: { sp: Record<string, string>; recipients?: { id: string; displayName: string }[]; documents: { id: string; ref: string; title: string }[]; hidePerson?: boolean }) {
  return (
    <form className="card flex flex-wrap gap-2 items-end">
      {!hidePerson && recipients && <div><label className="lbl" htmlFor="f-r">Persona</label><select id="f-r" name="recipientId" defaultValue={sp.recipientId ?? ""} className="input"><option value="">Todas</option>{recipients.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}</select></div>}
      {!hidePerson && <div><label className="lbl" htmlFor="f-c">Empresa</label><input id="f-c" name="company" defaultValue={sp.company ?? ""} className="input" /></div>}
      <div><label className="lbl" htmlFor="f-d">Documento</label><select id="f-d" name="documentId" defaultValue={sp.documentId ?? ""} className="input"><option value="">Todos</option>{documents.map((d) => <option key={d.id} value={d.id}>{d.ref} {d.title}</option>)}</select></div>
      <div><label className="lbl" htmlFor="f-from">Desde (UTC)</label><input id="f-from" type="date" name="from" defaultValue={sp.from ?? ""} className="input" /></div>
      <div><label className="lbl" htmlFor="f-to">Hasta (UTC)</label><input id="f-to" type="date" name="to" defaultValue={sp.to ?? ""} className="input" /></div>
      <button className="btn btn-secondary">Filtrar</button>
    </form>
  );
}
