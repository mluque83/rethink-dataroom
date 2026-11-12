import { db, schema } from "@/server/db";
import { Badge, Flash } from "@/components/Flash";
import { checklistAction, sectionAction } from "../actions";

export default async function Checklist({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const d = db();
  const [sections, items, docs] = await Promise.all([d.select().from(schema.sections).orderBy(schema.sections.sortOrder), d.select().from(schema.checklistItems).orderBy(schema.checklistItems.sortOrder),
    d.select({ id: schema.documents.id, ref: schema.documents.ref, title: schema.documents.title, sectionId: schema.documents.sectionId }).from(schema.documents)]);
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2"><h1 className="flex-1">Documentación esperada y pendiente</h1><a className="btn btn-secondary btn-sm" href="/api/admin/export?type=pending">Exportar pendientes (CSV)</a></div>
      <Flash searchParams={searchParams} />
      <p className="text-sm text-muted">La existencia de una categoría o elemento no implica que el documento exista ni que sea obligatorio. «Pendiente» y «No aplica» exigen justificación.</p>
      {sections.map((s) => (
        <section key={s.id} className="card space-y-2">
          <h2>{s.code}. {s.nameEs}</h2>
          {items.filter((i) => i.sectionId === s.id).map((i) => (
            <form key={i.id} action={checklistAction} className="grid md:grid-cols-[1fr_10rem_14rem_1fr_auto] gap-2 items-center border-b border-line pb-2">
              <input type="hidden" name="itemId" value={i.id} />
              <span className="text-sm">{i.title} <Badge v={i.status} /></span>
              <select name="status" defaultValue={i.status} className="input" aria-label="Estado"><option value="expected">Esperado</option><option value="pending">Pendiente</option><option value="received">Recibido</option><option value="not_applicable">No aplica</option></select>
              <select name="documentId" defaultValue={i.documentId ?? ""} className="input" aria-label="Documento"><option value="">— documento —</option>{docs.filter((x) => x.sectionId === s.id).map((x) => <option key={x.id} value={x.id}>{x.ref} {x.title}</option>)}</select>
              <input name="justification" defaultValue={i.justification ?? ""} placeholder="Justificación" className="input" aria-label="Justificación" />
              <button className="btn btn-secondary btn-sm">Guardar</button>
            </form>))}
          <form action={sectionAction} className="flex gap-2"><input type="hidden" name="op" value="add_item" /><input type="hidden" name="sectionId" value={s.id} />
            <input name="title" required placeholder="Añadir elemento esperado" className="input max-w-md" /><button className="btn btn-secondary btn-sm">Añadir</button></form>
        </section>))}
    </div>
  );
}
