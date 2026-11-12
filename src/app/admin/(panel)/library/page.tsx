import Link from "next/link";
import { sql } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { env } from "@/server/env";
import { Badge, Flash } from "@/components/Flash";
import { DocMetaFields } from "@/components/DocMetaFields";
import { createDocumentWithFileAction, batchUploadAction, sectionAction } from "../actions";

export default async function Library({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const status = sp.status ?? "";
  const d = db();
  const sections = await d.select().from(schema.sections).orderBy(schema.sections.sortOrder);
  const folders = await d.select().from(schema.folders).orderBy(schema.folders.sortOrder);
  const rows = (await d.execute<{ id: string; ref: string; title: string; section_id: string; folder_id: string | null; kind: string; is_demo: boolean; archived_at: Date | null;
    published_v: number | null; latest_v: number | null; latest_status: string | null; scan: string | null; product: string | null; validity_status: string; contains_patient_data: boolean }>(sql`
    SELECT d.id, d.ref, d.title, d.section_id, d.folder_id, d.kind, d.is_demo, d.archived_at, d.product, d.validity_status, d.contains_patient_data,
      pv.version_number AS published_v, lv.version_number AS latest_v, lv.status AS latest_status, lv.scan_status AS scan
    FROM documents d
    LEFT JOIN document_versions pv ON pv.id = d.current_published_version_id
    LEFT JOIN LATERAL (SELECT * FROM document_versions v WHERE v.document_id = d.id ORDER BY version_number DESC LIMIT 1) lv ON true
    WHERE (${q} = '' OR d.title ILIKE ${"%" + q + "%"} OR d.ref ILIKE ${"%" + q + "%"} OR coalesce(d.source,'') ILIKE ${"%" + q + "%"}
           OR coalesce(d.product,'') ILIKE ${"%" + q + "%"} OR coalesce(d.market,'') ILIKE ${"%" + q + "%"} OR coalesce(d.owner_name,'') ILIKE ${"%" + q + "%"}
           OR coalesce(d.notes,'') ILIKE ${"%" + q + "%"} OR array_to_string(d.tags, ' ') ILIKE ${"%" + q + "%"})
      AND (${status} = '' OR (${status} = 'review' AND lv.status IN ('uploaded','processing','in_review','approved'))
           OR (${status} = 'failed' AND lv.status = 'conversion_failed') OR (${status} = 'quarantine' AND lv.scan_status IN ('not_configured','pending','error'))
           OR (${status} = 'archived' AND d.archived_at IS NOT NULL))
    ORDER BY d.ref`)).rows;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2"><h1 className="flex-1">Biblioteca documental</h1>
        <a className="btn btn-secondary btn-sm" href="/api/admin/export?type=index">Exportar índice (CSV)</a></div>
      <Flash searchParams={searchParams} />
      <form className="flex flex-wrap gap-2" role="search">
        <input name="q" defaultValue={q} placeholder="Buscar por título, referencia, etiquetas, fuente, producto, mercado…" className="input max-w-lg" />
        <select name="status" defaultValue={status} className="input max-w-[14rem]"><option value="">Todos</option><option value="review">En revisión</option><option value="failed">Conversión fallida</option><option value="quarantine">Cuarentena</option><option value="archived">Archivados</option></select>
        <button className="btn btn-secondary">Buscar</button>
      </form>
      {sections.map((s) => {
        const docs = rows.filter((r) => r.section_id === s.id);
        if (q && !docs.length) return null;
        return (
          <section key={s.id} className="card">
            <h2>{s.code}. {s.nameEs} <span className="text-sm text-muted font-normal">({docs.length})</span></h2>
            {folders.filter((f) => f.sectionId === s.id).length > 0 && <p className="text-xs text-muted">Carpetas: {folders.filter((f) => f.sectionId === s.id).map((f) => f.name).join(" · ")}</p>}
            {docs.length > 0 && <div className="table-wrap"><table className="tbl mt-2"><thead><tr><th>Ref.</th><th>Título</th><th>Publicada</th><th>Última versión</th><th>Antivirus</th><th>Vigencia</th></tr></thead><tbody>
              {docs.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs">{r.ref}</td>
                  <td><Link href={`/admin/documents/${r.id}`}>{r.title}</Link> {r.is_demo && <span className="badge badge-demo">DEMO</span>} {r.kind === "redacted" && <span className="badge">expurgado</span>} {r.archived_at && <span className="badge">archivado</span>} {r.contains_patient_data && <span className="badge badge-danger">datos de pacientes</span>}</td>
                  <td>{r.published_v ? `v${r.published_v}` : <span className="text-muted">—</span>}</td>
                  <td>{r.latest_v ? <>v{r.latest_v} <Badge v={r.latest_status} /></> : "—"}</td>
                  <td><Badge v={r.scan} /></td>
                  <td><Badge v={r.validity_status} /></td>
                </tr>))}
            </tbody></table></div>}
          </section>
        );
      })}
      <details className="card" open={!rows.length}>
        <summary className="font-semibold cursor-pointer">Nuevo documento</summary>
        <form action={createDocumentWithFileAction} className="space-y-3 mt-3">
          <DocMetaFields sections={sections} folders={folders} />
          <div><label className="lbl" htmlFor="file">Archivo (PDF, DOCX, XLSX, PPTX, PNG, JPG — máx. {env().UPLOAD_MAX_MB} MB)</label>
            <input id="file" name="file" type="file" accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg" className="input" /></div>
          <p className="text-xs text-muted">La versión queda privada en revisión. Nada se publica sin aprobación y publicación explícitas.</p>
          <button className="btn">Crear documento</button>
        </form>
      </details>
      <details className="card">
        <summary className="font-semibold cursor-pointer">Carga por lotes</summary>
        <form action={batchUploadAction} className="space-y-3 mt-3">
          <div><label className="lbl" htmlFor="b-section">Categoría</label><select id="b-section" name="sectionId" className="input">{sections.map((s) => <option key={s.id} value={s.id}>{s.code}. {s.nameEs}</option>)}</select></div>
          <input name="files" type="file" multiple accept=".pdf,.docx,.xlsx,.pptx,.png,.jpg,.jpeg" className="input" />
          <p className="text-xs text-muted">Se crea un documento privado por archivo (título = nombre del archivo, editable). Completa los metadatos después.</p>
          <button className="btn">Cargar en revisión</button>
        </form>
      </details>
      <details className="card">
        <summary className="font-semibold cursor-pointer">Categorías y carpetas</summary>
        <div className="grid md:grid-cols-3 gap-4 mt-3">
          <form action={sectionAction} className="space-y-2"><input type="hidden" name="op" value="add_folder" />
            <h3>Nueva carpeta</h3><select name="sectionId" className="input">{sections.map((s) => <option key={s.id} value={s.id}>{s.code}. {s.nameEs}</option>)}</select>
            <select name="parentId" className="input"><option value="">(raíz de la categoría)</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select>
            <input name="name" required placeholder="Nombre" className="input" /><button className="btn btn-sm">Añadir</button></form>
          <form action={sectionAction} className="space-y-2"><input type="hidden" name="op" value="rename" />
            <h3>Renombrar categoría</h3><select name="sectionId" className="input">{sections.map((s) => <option key={s.id} value={s.id}>{s.code}. {s.nameEs}</option>)}</select>
            <input name="nameEs" required placeholder="Nombre (ES)" className="input" /><input name="nameEn" required placeholder="Name (EN)" className="input" /><button className="btn btn-sm">Guardar</button></form>
          <form action={sectionAction} className="space-y-2"><input type="hidden" name="op" value="add_section" />
            <h3>Nueva categoría</h3><input name="code" required placeholder="Código (p. ej. 13)" className="input" pattern="[0-9A-Za-z]{1,4}" />
            <input name="nameEs" required placeholder="Nombre (ES)" className="input" /><input name="nameEn" placeholder="Name (EN)" className="input" /><button className="btn btn-sm">Añadir</button></form>
        </div>
      </details>
    </div>
  );
}
