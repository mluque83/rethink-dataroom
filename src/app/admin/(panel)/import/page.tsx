import { desc } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { fmtDateTime } from "@/lib/format";

export default async function ImportPage() {
  const batches = await db().select().from(schema.importBatches).orderBy(desc(schema.importBatches.createdAt));
  return (
    <div className="space-y-4"><h1>Importación de documentación existente</h1>
      <div className="card text-sm space-y-2">
        <p>La importación de una carpeta se ejecuta desde la línea de comandos en el servidor (los originales no se modifican):</p>
        <pre className="bg-[#eef2f4] p-2 rounded text-xs">npm run import:folder -- /ruta/a/carpeta            # inventario y propuesta (no importa)
npm run import:folder -- /ruta/a/carpeta --import   # importa a revisión interna (nada se publica)</pre>
        <p>Produce: inventario con hash SHA-256, propuesta de clasificación por palabras clave, duplicados exactos, posibles versiones, fechas dudosas y lista de pendientes. No deduce firma, vigencia ni aprobación por el nombre del archivo, no elimina duplicados y no envía documentos a servicios externos.</p></div>
      {batches.map((b) => { const r = b.report as { summary?: Record<string, number> }; return (
        <details key={b.id} className="card"><summary className="cursor-pointer">{fmtDateTime(b.createdAt)} — {b.sourceLabel} — {JSON.stringify(r.summary)}</summary>
          <pre className="text-xs overflow-auto max-h-96">{JSON.stringify(b.report, null, 2)}</pre></details>); })}
    </div>
  );
}
