// Builds a DATA-MINIMISED shareholder register (no shareholder names at all: natural persons and
// companies are aggregated by holding band) from a parsed register,
// uploads it as a REDACTED COPY linked to the original version, processes it and runs the
// redaction verifier with every natural-person name as a forbidden term. Never publishes:
// approval, manual attestation and publication remain explicit admin actions.
//   npm run register:minimize -- <parsed.json> <ORIGINAL_DOC_REF> <out.pdf> [--update <MINIMISED_DOC_REF>]
// --update adds a new version to an existing minimised copy (previous unpublished versions are rejected).
// parsed.json: [{ rank, name, shares, pct, type: "natural" | "legal" }]  (kept outside git)
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { promises as fs } from "node:fs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

interface Row { rank: number; name: string; shares: number; pct: number; type: "natural" | "legal" }
const ORANGE = rgb(0.918, 0.588, 0), INK = rgb(0.184, 0.192, 0.2), GREY = rgb(0.35, 0.36, 0.36);
const fmtN = (n: number) => n.toLocaleString("es-ES");
const fmtP = (n: number) => `${n.toFixed(2).replace(".", ",")} %`;

async function main() {
  const [parsedPath, ref, out] = process.argv.slice(2);
  if (!out) throw new Error("usage: minimize-register <parsed.json> <DOC-REF> <out.pdf>");
  const rows = JSON.parse(await fs.readFile(parsedPath, "utf8")) as Row[];
  const total = rows.reduce((s, r) => s + r.shares, 0);
  const holders = rows.filter((r) => r.shares > 0);
  const nil = rows.filter((r) => r.shares === 0);
  const pct = (s: number) => (s / total) * 100;
  const sorted = [...holders].sort((a, b) => b.shares - a.shares);
  const topN = (n: number) => sorted.slice(0, n).reduce((s, r) => s + r.shares, 0);
  const nat = holders.filter((r) => r.type === "natural"), leg = holders.filter((r) => r.type === "legal");
  const band = (set: Row[], f: (p: number) => boolean) => { const b = set.filter((r) => f(pct(r.shares))); return { n: b.length, s: b.reduce((x, r) => x + r.shares, 0) }; };
  const ranges: [string, (p: number) => boolean][] = [["con 5 % o más", (p) => p >= 5], ["entre 1 % y 5 %", (p) => p >= 1 && p < 5], ["con menos de 1 %", (p) => p < 1]];
  const bands = [
    ...ranges.map(([l, fn]) => [`Personas físicas ${l}`, band(nat, fn)] as const),
    ...ranges.map(([l, fn]) => [`Personas jurídicas ${l}`, band(leg, fn)] as const),
  ].filter(([, b]) => b.n > 0);

  const { db, schema } = await import("../src/server/db");
  const { eq, and } = await import("drizzle-orm");
  const orig = await db().query.documents.findFirst({ where: eq(schema.documents.ref, ref) });
  if (!orig) throw new Error(`document ${ref} not found`);
  const srcVersion = await db().query.documentVersions.findFirst({ where: and(eq(schema.documentVersions.documentId, orig.id), eq(schema.documentVersions.versionNumber, 1)) });
  if (!srcVersion) throw new Error("source version not found");

  // ------------------------------ PDF ------------------------------
  const pdf = await PDFDocument.create();
  const f = await pdf.embedFont(StandardFonts.Helvetica), fb = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logo = await pdf.embedPng(await fs.readFile("public/brand/rethink-medical-logo.png"));
  const page: PDFPage = pdf.addPage([595, 842]);
  let y = 842;
  page.drawRectangle({ x: 0, y: 836, width: 595, height: 6, color: ORANGE });
  page.drawImage(logo, { x: 40, y: 770, width: 140, height: 140 * (logo.height / logo.width) });
  y = 740;
  const text = (s: string, o: { x?: number; size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; dy?: number } = {}) => {
    page.drawText(s, { x: o.x ?? 40, y, size: o.size ?? 9.5, font: o.font ?? f, color: o.color ?? INK });
    y -= o.dy ?? 14;
  };
  // No "draft" banner inside the file: review state is tracked by the data room (the version is
  // invisible to recipients until an admin approves, attests and publishes it).
  y -= 6;
  text("Registro de socios — versión minimizada (fase inicial)", { font: fb, size: 16, dy: 18 });
  text("Rethink Medical, S.L. · Capital emitido · Sin identificación de socios", { color: GREY, dy: 26 });

  text("CIFRAS DEL REGISTRO", { font: fb, size: 10.5, dy: 16 });
  for (const [k, v] of [
    ["Participaciones emitidas", `${fmtN(total)} (valor nominal 1,00 € cada una)`],
    ["Capital social registrado", `${fmtN(total)} €`],
    ["Socios con participaciones", `${holders.length}`],
    ["Registros sin participaciones (pendientes de aclarar en el original)", `${nil.length}`],
    ["Concentración: 2 mayores socios", fmtP(pct(topN(2)))],
    ["Concentración: 5 mayores socios", fmtP(pct(topN(5)))],
    ["Concentración: 10 mayores socios", fmtP(pct(topN(10)))],
  ]) { text(k, { dy: 0 }); text(v, { x: 360, font: fb }); }
  y -= 10;

  text("DISTRIBUCIÓN POR TIPO DE SOCIO", { font: fb, size: 10.5, dy: 16 });
  text("Grupo", { font: fb, dy: 0 }); text("Socios", { x: 330, font: fb, dy: 0 }); text("Participaciones", { x: 390, font: fb, dy: 0 }); text("%", { x: 500, font: fb });
  const row = (a: string, n: number, s: number, bold = false) => { const fo = bold ? fb : f; text(a, { font: fo, dy: 0 }); text(String(n), { x: 330, font: fo, dy: 0 }); text(fmtN(s), { x: 390, font: fo, dy: 0 }); text(fmtP(pct(s)), { x: 500, font: fo }); };
  for (const [label, b] of bands) row(label, b.n, b.s);
  row("Subtotal personas físicas", nat.length, nat.reduce((x, r) => x + r.shares, 0), true);
  row("Subtotal personas jurídicas", leg.length, leg.reduce((x, r) => x + r.shares, 0), true);
  row("Total", holders.length, total, true);
  y -= 10;

  text("NOTAS", { font: fb, size: 10.5, dy: 16 });
  for (const n of [
    "• Versión para la fase inicial: no identifica a ningún socio (personas físicas ni jurídicas). Las dos mayores",
    "   participaciones corresponden a personas físicas. La identidad de los socios se facilitará, en su caso, en la",
    "   fase de due diligence avanzada.",
    "• Refleja únicamente capital emitido; no es un cap table totalmente diluido (no incluye opciones, warrants,",
    "   convertibles ni otros derechos).",
    "• El original no indica una fecha de referencia explícita; el original señala además discrepancias de recuento",
    "   (84 registros en cabecera frente a 83 líneas) y 2 registros sin participaciones pendientes de aclarar.",
    "• Porcentajes recalculados sobre el total de participaciones; pueden diferir en el redondeo del original.",
  ]) text(n, { size: 8.6, dy: 12 });
  y -= 6;
  text(`Fuente: ${orig.ref} «${orig.title}», versión ${srcVersion.versionNumber}, tabla «Full register» (págs. 2-4).`, { size: 7.8, color: GREY, dy: 11 });
  text(`Generado el ${new Date().toISOString().slice(0, 10)} por agregación aritmética; ${holders.length} socios y ${fmtN(total)} participaciones cuadran con el total del original.`, { size: 7.8, color: GREY });
  pdf.setTitle("Registro de socios — versión minimizada"); pdf.setAuthor("Rethink Medical, S.L."); pdf.setProducer("Rethink Medical data room"); pdf.setCreator("Rethink Medical data room");
  pdf.setSubject("Sin identificación de socios"); pdf.setKeywords([]);
  const bytes = Buffer.from(await pdf.save());
  await fs.writeFile(out, bytes, { mode: 0o600 });

  // ---------------- upload as redacted copy + verify (nothing published) ----------------
  const { createDocument, uploadVersion, releaseUnscannedDev } = await import("../src/server/documents/library");
  const { processVersion } = await import("../src/server/documents/pipeline");
  const { verifyRedaction } = await import("../src/server/documents/redaction");
  const admin = (await db().query.user.findFirst({ where: eq(schema.user.role, "admin") }))!;
  const ui = process.argv.indexOf("--update");
  const existing = ui > 0 ? await db().query.documents.findFirst({ where: eq(schema.documents.ref, process.argv[ui + 1]) }) : undefined;
  if (ui > 0 && (!existing || existing.redactedFromVersionId !== srcVersion.id)) throw new Error("--update target is not a redacted copy of this source version");
  const { rejectVersion } = await import("../src/server/documents/library");
  if (existing) {
    for (const old of await db().select().from(schema.documentVersions).where(eq(schema.documentVersions.documentId, existing.id))) {
      if (["in_review", "approved", "conversion_failed"].includes(old.status)) await rejectVersion({ userId: admin.id }, old.id, "Sustituida por una versión que agrupa también a las personas jurídicas");
    }
  }
  const copy = existing ?? await createDocument({ userId: admin.id }, {
    title: "Registro de socios — versión minimizada (sin identificación de socios)", sectionId: orig.sectionId, folderId: orig.folderId,
    confidentiality: "confidential", validityStatus: "pending_verification", source: `Generado desde ${orig.ref} v${srcVersion.versionNumber}`,
    notes: "BORRADOR generado automáticamente para la fase inicial (decisión del administrador: opción b). Revisar contenido y nombres de sociedades que pudieran identificar a una persona; aprobar y atestar antes de publicar.",
    tags: ["cap table", "minimizado"],
  }, { kind: "redacted", redactedFromVersionId: srcVersion.id });
  if (existing) {
    const { updateDocumentMeta } = await import("../src/server/documents/library");
    await updateDocumentMeta({ userId: admin.id }, existing.id, { title: "Registro de socios — versión minimizada (sin identificación de socios)" });
  }
  const { version } = await uploadVersion({ userId: admin.id }, copy.id, "registro-socios-minimizado.pdf", bytes,
    { changeSummary: existing ? "Agrupa también a las personas jurídicas por tramos (sin nombres de socios)" : "versión minimizada generada" });
  await processVersion(version.id);
  const v = await db().query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, version.id) });
  if (v?.scanStatus === "not_configured" && process.env.APP_ENV !== "production") await releaseUnscannedDev({ userId: admin.id }, version.id);
  // forbidden terms: every natural-person name (full name and its last two words)
  const terms = new Set<string>();
  for (const r of rows) { // every shareholder name (natural and legal persons) must be absent
    terms.add(r.name);
    const w = r.name.split(/\s+/);
    if (w.length >= 3) terms.add(w.slice(-2).join(" "));
  }
  const check = await verifyRedaction(admin.id, version.id, [...terms]);
  console.log(JSON.stringify({ copy: copy.ref, version: version.id, termsChecked: terms.size, result: check.result,
    checks: (check.checks as { name: string; status: string; foundTermIndexes: number[] }[]).map((c) => `${c.name}:${c.status}${c.foundTermIndexes.length ? `(${c.foundTermIndexes.length})` : ""}`) }));
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
