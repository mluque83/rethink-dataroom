import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { Badge } from "@/components/Flash";
import { fmtDateTime } from "@/lib/format";

export default async function QaAdmin() {
  const rows = await db().select({ q: schema.questions, name: schema.recipients.displayName }).from(schema.questions)
    .innerJoin(schema.recipients, eq(schema.recipients.id, schema.questions.recipientId)).orderBy(desc(schema.questions.createdAt));
  return (
    <div className="space-y-4"><h1>Preguntas y respuestas</h1>
      <p className="text-sm text-muted">Privadas por destinatario. Compartir con un grupo es una acción explícita por pregunta. Las notas internas nunca son visibles para visitantes.</p>
      <div className="card table-wrap"><table className="tbl"><thead><tr><th>Fecha</th><th>Autor</th><th>Asunto</th><th>Estado</th><th>Visibilidad</th></tr></thead><tbody>
        {rows.map(({ q, name }) => <tr key={q.id}><td className="text-xs">{fmtDateTime(q.createdAt)}</td><td>{name}</td><td><Link href={`/admin/qa/${q.id}`}>{q.subject}</Link></td><td><Badge v={q.status} /></td><td>{q.visibility}</td></tr>)}
      </tbody></table></div></div>
  );
}
