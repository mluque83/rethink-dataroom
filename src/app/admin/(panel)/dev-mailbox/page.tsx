import { notFound } from "next/navigation";
import { desc } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { fmtDateTime } from "@/lib/format";

/** DEVELOPMENT ONLY: messages captured by EMAIL_PROVIDER=dev. Not available in production. */
export default async function DevMailbox() {
  if (env().APP_ENV === "production" || env().EMAIL_PROVIDER !== "dev") notFound();
  const mails = await db().select().from(schema.devOutbox).orderBy(desc(schema.devOutbox.createdAt)).limit(50);
  return (
    <div className="space-y-4"><h1>Buzón de desarrollo</h1>
      <p className="notice notice-warn">Entorno de pruebas: ningún correo sale de esta máquina. Esta página no existe en producción.</p>
      {mails.map((m) => <article key={m.id} className="card text-sm" data-testid="dev-mail"><p><strong>Para:</strong> {m.to} · {fmtDateTime(m.createdAt)}</p><p><strong>{m.subject}</strong></p><pre className="whitespace-pre-wrap text-xs mt-2">{m.bodyText}</pre></article>)}
    </div>
  );
}
