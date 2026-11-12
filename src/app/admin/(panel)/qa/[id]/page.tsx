import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { isUuid } from "@/server/permissions";
import { Badge, Flash } from "@/components/Flash";
import { fmtDateTime } from "@/lib/format";
import { qaAction } from "../../actions";

export default async function QaDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const d = db();
  const q = await d.query.questions.findFirst({ where: eq(schema.questions.id, id) });
  if (!q) notFound();
  const [author, notes, ans, admins, groups, docs] = await Promise.all([
    d.query.recipients.findFirst({ where: eq(schema.recipients.id, q.recipientId) }),
    d.select().from(schema.questionNotes).where(eq(schema.questionNotes.questionId, id)).orderBy(asc(schema.questionNotes.createdAt)),
    d.select().from(schema.answers).where(eq(schema.answers.questionId, id)).orderBy(asc(schema.answers.createdAt)),
    d.select().from(schema.user).where(eq(schema.user.role, "admin")), d.select().from(schema.groups), d.select().from(schema.documents),
  ]);
  const draft = ans.find((a) => a.status === "draft");
  const doc = docs.find((x) => x.id === q.documentId);
  const h = (op: string) => <><input type="hidden" name="questionId" value={id} /><input type="hidden" name="op" value={op} /></>;
  return (
    <div className="space-y-4">
      <Link href="/admin/qa" className="text-sm">← Q&A</Link>
      <h1>{q.subject}</h1><Flash searchParams={searchParams} />
      <div className="card space-y-1"><p className="text-sm">De <strong>{author?.displayName}</strong> · {fmtDateTime(q.createdAt)} · <Badge v={q.status} /> {doc && <>· sobre {doc.ref} {doc.title}</>}</p><p className="whitespace-pre-wrap">{q.body}</p></div>
      <form action={qaAction} className="card flex flex-wrap gap-2 items-end">{h("update")}
        <div><label className="lbl" htmlFor="st">Estado</label><select id="st" name="status" defaultValue={q.status} className="input"><option value="open">Abierta</option><option value="in_progress">En curso</option><option value="answered">Respondida</option><option value="closed">Cerrada</option></select></div>
        <div><label className="lbl" htmlFor="as">Responsable interno</label><select id="as" name="assigneeUserId" defaultValue={q.assigneeUserId ?? ""} className="input"><option value="">—</option>{admins.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></div>
        <button className="btn btn-secondary">Guardar</button></form>
      <section className="card space-y-2"><h2>Notas internas (no visibles para el visitante)</h2>
        {notes.map((n) => <p key={n.id} className="text-sm border-l-4 border-line pl-2">{fmtDateTime(n.createdAt)} — {n.body}</p>)}
        <form action={qaAction} className="flex gap-2">{h("note")}<input name="body" required className="input" placeholder="Nota interna" /><button className="btn btn-secondary btn-sm">Añadir</button></form></section>
      <section className="card space-y-2"><h2>Respuesta</h2>
        {ans.filter((a) => a.status === "published").map((a) => <div key={a.id} className="notice"><p className="text-xs">Publicada {fmtDateTime(a.publishedAt)}</p><p className="whitespace-pre-wrap">{a.body}</p></div>)}
        <form action={qaAction} className="space-y-2">{h("draft")}
          <textarea name="body" rows={5} required defaultValue={draft?.body} className="input" />
          <label className="lbl" htmlFor="att">Adjuntos (documentos del data room; solo los verá si tiene permiso de consulta)</label>
          <select id="att" name="attachments" multiple className="input h-32" defaultValue={draft?.attachmentDocumentIds}>{docs.map((x) => <option key={x.id} value={x.id}>{x.ref} {x.title}</option>)}</select>
          <button className="btn btn-secondary">Guardar borrador</button></form>
        {draft && <form action={qaAction}>{h("publish")}<input type="hidden" name="answerId" value={draft.id} /><button className="btn">Publicar respuesta al destinatario</button></form>}
      </section>
      <form action={qaAction} className="card flex gap-2 items-end">{h("share")}
        <div><label className="lbl" htmlFor="sg">Compartir esta pregunta y sus respuestas publicadas con un grupo (acción explícita)</label>
          <select id="sg" name="groupId" defaultValue={q.sharedGroupId ?? ""} className="input"><option value="">No compartir (solo autor)</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
        <button className="btn btn-secondary">Aplicar</button></form>
    </div>
  );
}
