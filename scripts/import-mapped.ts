// Curated import driven by a reviewable JSON mapping (classification decided by a person).
//   npm run import:mapped -- <mapping.json>
// Each entry: { path, section, folder?, title, documentDate?, confidentiality?, validityStatus?, product?, market?,
//               source?, notes?, tags?, containsPatientData? }
// Optional top-level "checklist": [{ section, title, status, justification?, documentPath? }]  (adds or updates items)
// Guarantees: originals are only read; everything lands PRIVATE in review; nothing is published; duplicates (same SHA-256
// already imported) are skipped and reported, never deleted.
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

interface Entry { path: string; section: string; folder?: string; title: string; documentDate?: string | null; confidentiality?: string; validityStatus?: string;
  product?: string | null; market?: string | null; source?: string; notes?: string; tags?: string[]; containsPatientData?: boolean }
interface Check { section: string; title: string; status: string; justification?: string; documentPath?: string }

async function main() {
  const mapFile = process.argv[2];
  if (!mapFile) throw new Error("usage: import-mapped <mapping.json>");
  const map = JSON.parse(await fs.readFile(mapFile, "utf8")) as { root: string; label: string; entries: Entry[]; checklist?: Check[] };
  const { db, schema } = await import("../src/server/db");
  const { eq, and } = await import("drizzle-orm");
  const { createDocument, uploadVersion } = await import("../src/server/documents/library");
  const { enqueueProcessing } = await import("../src/server/jobs");
  const d = db();
  const admin = await d.query.user.findFirst({ where: eq(schema.user.role, "admin") });
  if (!admin) throw new Error("no admin user");
  const sections = await d.select().from(schema.sections);
  const sec = (code: string) => { const s = sections.find((x) => x.code === code); if (!s) throw new Error(`unknown section ${code}`); return s; };
  const existing = new Set((await d.select({ sha: schema.files.sha256 }).from(schema.files).where(eq(schema.files.purpose, "original"))).map((x) => x.sha));
  const [batch] = await d.insert(schema.importBatches).values({ sourceLabel: map.label, report: { mapping: path.basename(mapFile), entries: map.entries.length } }).returning();
  const folderCache = new Map<string, string>();
  async function folderId(sectionId: string, name?: string) {
    if (!name) return null;
    const k = `${sectionId}/${name}`;
    if (folderCache.has(k)) return folderCache.get(k)!;
    let f = await d.query.folders.findFirst({ where: and(eq(schema.folders.sectionId, sectionId), eq(schema.folders.name, name)) });
    if (!f) [f] = await d.insert(schema.folders).values({ sectionId, name }).returning();
    folderCache.set(k, f.id);
    return f.id;
  }
  const docByPath = new Map<string, string>();
  const report: Record<string, string>[] = [];
  for (const e of map.entries) {
    const full = path.join(map.root, e.path);
    const buf = await fs.readFile(full);
    const sha = createHash("sha256").update(buf).digest("hex");
    if (existing.has(sha)) { report.push({ path: e.path, result: "skipped: exact duplicate already imported" }); continue; }
    const s = sec(e.section);
    const doc = await createDocument({ userId: admin.id }, {
      title: e.title, sectionId: s.id, folderId: await folderId(s.id, e.folder), documentDate: e.documentDate ?? null,
      confidentiality: e.confidentiality ?? "confidential", validityStatus: e.validityStatus ?? "pending_verification",
      product: e.product ?? null, market: e.market ?? null, source: e.source ?? `Importación ${map.label}: ${e.path}`,
      notes: e.notes ?? null, tags: [...(e.tags ?? []), "importado"], containsPatientData: !!e.containsPatientData,
    });
    try {
      const { version } = await uploadVersion({ userId: admin.id }, doc.id, path.basename(e.path), buf, { importBatchId: batch.id, changeSummary: "importación inicial" });
      await enqueueProcessing(version.id);
      existing.add(sha);
      docByPath.set(e.path, doc.id);
      report.push({ path: e.path, result: `imported ${doc.ref} → ${e.section}${e.folder ? "/" + e.folder : ""}` });
    } catch (err) { report.push({ path: e.path, result: `FAILED: ${(err as Error).message}` }); }
  }
  for (const c of map.checklist ?? []) {
    const s = sec(c.section);
    const documentId = c.documentPath ? docByPath.get(c.documentPath) ?? null : null;
    const found = await d.query.checklistItems.findFirst({ where: and(eq(schema.checklistItems.sectionId, s.id), eq(schema.checklistItems.title, c.title)) });
    if (found) await d.update(schema.checklistItems).set({ status: c.status, justification: c.justification ?? null, documentId, updatedBy: admin.id, updatedAt: new Date() }).where(eq(schema.checklistItems.id, found.id));
    else await d.insert(schema.checklistItems).values({ sectionId: s.id, title: c.title, status: c.status, justification: c.justification ?? null, documentId, sortOrder: 50, updatedBy: admin.id });
  }
  await d.update(schema.importBatches).set({ report: { mapping: path.basename(mapFile), results: report, checklistUpdates: map.checklist?.length ?? 0 } }).where(eq(schema.importBatches.id, batch.id));
  await d.insert(schema.auditEvents).values({ actorType: "system", action: "import.mapped", targetType: "import_batch", targetId: batch.id, details: { entries: map.entries.length } });
  for (const r of report) console.log(`${r.result.padEnd(48)} ${r.path}`);
  console.log("Nothing was published. Review each version in Admin → Biblioteca.");
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
