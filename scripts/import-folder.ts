// Inventory and (optionally) import an existing folder into INTERNAL REVIEW.
//   npm run import:folder -- /path/to/folder            → report only (writes import-report-*.json/.csv)
//   npm run import:folder -- /path/to/folder --import   → also creates private documents in review
// Guarantees: originals are only READ; nothing is deleted, deduplicated or published;
// signature/validity/approval are never inferred from file names; nothing is sent to external services.
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

const RULES: [string, RegExp][] = [
  ["00", /presentaci|pitch|deck|indice|índice|contact|resumen/i],
  ["01", /escritura|estatut|registr|pacto|acta|poder|titularidad|governance|board/i],
  ["02", /cap.?table|ampliaci|inversi|convertible|prestamo|préstamo|ayuda|subvenci|enisa|cdti|ronda|uso de fondos/i],
  ["03", /cuentas|balance|pyg|p&l|tesorer|modelo financ|forecast|previsi|deuda|fiscal|impuesto|iva|irpf/i],
  ["04", /t-?control|easy.?in|especificac|verificac|validac|roadmap|hoja de ruta|producto|dise[ñn]o/i],
  ["05", /regulat|certificad|marcado ce|\bce\b|mdr|fda|510|iso.?13485|calidad|auditor|riesgo|vigilancia|capa|etiquet|ifu|instrucciones de uso|conformidad/i],
  ["06", /cl[ií]nic|ensayo|estudio|protocolo|publicaci|paper|precl[ií]nic|ceim|aemps/i],
  ["07", /patente|patent|pct|epo|oepm|marca|trademark|licencia|cesi[oó]n|fto|libertad de operaci/i],
  ["08", /fabric|proveedor|supplier|esteriliz|lote|liberaci|suministro|manufactur/i],
  ["09", /distribu|comercial|venta|pipeline|precio|mercado|competen|market/i],
  ["10", /organigrama|cv|perfil|contrato laboral|incentiv|stock option|phantom|confidencialidad empleado/i],
  ["11", /seguro|litigio|demanda|contingenc|privacidad|rgpd|gdpr|compliance|contrato/i],
  ["12", /riesgo|q&a|preguntas|due diligence|incidencia/i],
];
const ALLOWED = /\.(pdf|docx|xlsx|pptx|png|jpe?g)$/i;

interface Item { relPath: string; size: number; sha256: string; mtime: string; ext: string; proposedSection: string | null; reason: string;
  duplicateOf?: string; possibleVersionGroup?: string; dateFlags: string[]; supported: boolean; patientDataHint: boolean }

async function walk(root: string, dir = root, out: string[] = []) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(root, p, out); else if (e.isFile()) out.push(p);
  }
  return out;
}

const stem = (f: string) => {
  let n = path.basename(f).replace(/\.[^.]+$/, "").toLowerCase();
  n = n.replace(/(19|20)\d{2}[-_.]?\d{2}([-_.]?\d{2})?/g, " ");                              // dates
  for (let k = 0; k < 3; k++) n = n.replace(/[_\-\s]*((v|ver|version|rev|r)\s*\d+(\.\d+)*|final|definitivo|draft|borrador|firmado|signed|copia|copy|\(\d+\))[_\-\s]*$/i, "").trim();
  return n.replace(/[_\-\s]+/g, " ").trim();
};

function dateFlags(name: string, mtime: Date) {
  const flags: string[] = [];
  const now = new Date();
  for (const m of name.matchAll(/(20\d{2}|19\d{2})[-_.]?(\d{2})[-_.]?(\d{2})?/g)) {
    const y = Number(m[1]), mo = Number(m[2]);
    if (mo < 1 || mo > 12) flags.push(`fecha no válida en el nombre: ${m[0]}`);
    else if (new Date(y, mo - 1) > now) flags.push(`fecha futura en el nombre: ${m[0]}`);
    else if (y < 2000) flags.push(`fecha muy antigua en el nombre: ${m[0]}`);
  }
  if (mtime > now) flags.push("fecha de modificación futura");
  if (/final|firmad|signed|definitiv/i.test(name)) flags.push("el nombre sugiere «final/firmado»: NO se infiere firma ni vigencia; verificar en el documento");
  return flags;
}

async function main() {
  const root = path.resolve(process.argv[2] ?? "");
  const doImport = process.argv.includes("--import");
  if (!process.argv[2]) throw new Error("usage: import-folder <dir> [--import]");
  const files = await walk(root);
  const items: Item[] = [];
  const bySha = new Map<string, string>();
  for (const f of files) {
    const st = await fs.stat(f);
    const buf = await fs.readFile(f);
    const sha = createHash("sha256").update(buf).digest("hex");
    const rel = path.relative(root, f);
    const hit = RULES.find(([, re]) => re.test(rel));
    const item: Item = { relPath: rel, size: st.size, sha256: sha, mtime: st.mtime.toISOString(), ext: path.extname(f).slice(1).toLowerCase(),
      proposedSection: hit?.[0] ?? null, reason: hit ? `coincidencia de palabra clave (${hit[1].source.slice(0, 40)}…)` : "sin coincidencia — clasificar manualmente",
      dateFlags: dateFlags(rel, st.mtime), supported: ALLOWED.test(f), patientDataHint: /paciente|patient|historia cl[ií]nica|hc\b|crd|nhc/i.test(rel) };
    if (bySha.has(sha)) item.duplicateOf = bySha.get(sha); else bySha.set(sha, rel);
    items.push(item);
  }
  const groups = new Map<string, Item[]>();
  for (const it of items) { const k = `${path.dirname(it.relPath)}/${stem(it.relPath)}`; groups.set(k, [...(groups.get(k) ?? []), it]); }
  for (const [k, g] of groups) if (g.length > 1 && new Set(g.map((x) => x.sha256)).size > 1) g.forEach((x) => (x.possibleVersionGroup = k));
  const pending = items.filter((i) => !i.proposedSection || !i.supported || i.dateFlags.length || i.patientDataHint);
  const summary = { files: items.length, supported: items.filter((i) => i.supported).length, exactDuplicates: items.filter((i) => i.duplicateOf).length,
    inPossibleVersionGroups: items.filter((i) => i.possibleVersionGroup).length, unclassified: items.filter((i) => !i.proposedSection).length,
    dateFlags: items.filter((i) => i.dateFlags.length).length, patientDataHints: items.filter((i) => i.patientDataHint).length };
  const report = { root: path.basename(root), generatedAt: new Date().toISOString(), summary, items, pendingReview: pending.map((p) => p.relPath),
    notes: ["Clasificación propuesta por palabras clave: requiere revisión humana.", "No se infiere firma, vigencia ni aprobación por el nombre.",
      "Los duplicados exactos NO se eliminan; se importa solo la primera aparición si se usa --import.", "Archivos con indicios de datos de pacientes se importan marcados y no son publicables."] };
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  await fs.mkdir(".local/import-reports", { recursive: true, mode: 0o700 });
  await fs.writeFile(`.local/import-reports/import-report-${stamp}.json`, JSON.stringify(report, null, 2), { mode: 0o600 });
  const csvCols: (keyof Item)[] = ["relPath", "size", "sha256", "proposedSection", "duplicateOf", "possibleVersionGroup", "supported", "patientDataHint"];
  await fs.writeFile(`.local/import-reports/import-report-${stamp}.csv`, [csvCols.join(",") + ",dateFlags", ...items.map((i) => csvCols.map((c) => JSON.stringify(i[c] ?? "")).join(",") + "," + JSON.stringify(i.dateFlags.join(" | ")))].join("\n"), { mode: 0o600 });
  console.log(JSON.stringify(summary), `→ import-report-${stamp}.json/.csv`);

  if (doImport) {
    const { db, schema } = await import("../src/server/db");
    const { eq } = await import("drizzle-orm");
    const { createDocument, uploadVersion } = await import("../src/server/documents/library");
    const { enqueueProcessing } = await import("../src/server/jobs");
    const adminUser = await db().query.user.findFirst({ where: eq(schema.user.role, "admin") });
    if (!adminUser) throw new Error("no admin user");
    const [batch] = await db().insert(schema.importBatches).values({ sourceLabel: path.basename(root), report: { summary, pendingReview: report.pendingReview } }).returning();
    const sections = await db().select().from(schema.sections);
    const fallback = sections.find((s) => s.code === "12") ?? sections[0];
    let n = 0;
    for (const it of items.filter((i) => i.supported && !i.duplicateOf)) {
      const sec = sections.find((s) => s.code === it.proposedSection) ?? fallback;
      const doc = await createDocument({ userId: adminUser.id }, {
        title: path.basename(it.relPath).replace(/\.[^.]+$/, ""), sectionId: sec.id, source: `Importación: ${it.relPath}`,
        notes: [it.proposedSection ? `Clasificación propuesta (${it.reason})` : "SIN CLASIFICAR", ...it.dateFlags, it.possibleVersionGroup ? `Posible grupo de versiones: ${it.possibleVersionGroup}` : ""].filter(Boolean).join(" · "),
        validityStatus: "pending_verification", containsPatientData: it.patientDataHint, tags: ["importado"],
      });
      try {
        const { version } = await uploadVersion({ userId: adminUser.id }, doc.id, it.relPath, await fs.readFile(path.join(root, it.relPath)), { importBatchId: batch.id });
        await enqueueProcessing(version.id); n++;
      } catch (e) { console.error(`skipped ${it.relPath}: ${(e as Error).message}`); }
    }
    console.log(`imported ${n} file(s) into internal review (batch ${batch.id}). Nothing was published.`);
  }
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
