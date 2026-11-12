import "server-only";
import { promises as fs } from "node:fs";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { storage } from "../storage";
import { audit } from "../audit";
import { runSandboxed, inSandbox, makeWorkdir } from "./sandbox";
import { ooxmlParts, pdfText, ocrPages, type PageImage } from "./convert";
import { sandboxOpts } from "./pipeline";
import { DomainError } from "./library";

/**
 * Verification of a redacted copy that was prepared OUTSIDE this system
 * (we deliberately do not offer an in-app redaction editor: drawing boxes is
 * not removal). The admin supplies the strings that must be gone; they are
 * used in memory only and never stored (only their count and per-index results).
 */
export type CheckStatus = "pass" | "fail" | "not_checked";
export interface RedactionCheck { name: string; status: CheckStatus; foundTermIndexes: number[]; note?: string }

export const normalize = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const findTerms = (corpus: string, terms: string[]) => {
  const c = normalize(corpus);
  const cNoSpace = c.replace(/\s/g, "");
  return terms.map((t, i) => (c.includes(normalize(t)) || cNoSpace.includes(normalize(t).replace(/\s/g, "")) ? i : -1)).filter((i) => i >= 0);
};
const check = (name: string, corpus: string | null, terms: string[], note?: string): RedactionCheck => {
  if (corpus === null) return { name, status: "not_checked", foundTermIndexes: [], note };
  const f = findTerms(corpus, terms);
  return { name, status: f.length ? "fail" : "pass", foundTermIndexes: f, note };
};

async function pdfForensics(pdf: Buffer) {
  const sb = sandboxOpts();
  const dir = await makeWorkdir();
  try {
    await fs.writeFile(path.join(dir, "in", "d.pdf"), pdf);
    await runSandboxed(["qpdf", "--qdf", "--object-streams=disable", inSandbox(sb, dir, "in/d.pdf"), inSandbox(sb, dir, "out/q.pdf")], dir, sb);
    await runSandboxed(["sh", "-c", `exiftool -j -a -G1 ${inSandbox(sb, dir, "in/d.pdf")} > ${inSandbox(sb, dir, "out/meta.json")}`], dir, sb);
    const raw = await fs.readFile(path.join(dir, "out", "q.pdf")).catch(() => null);
    const meta = await fs.readFile(path.join(dir, "out", "meta.json"), "utf8").catch(() => null);
    return { raw: raw ? raw.toString("latin1") : null, meta };
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** decode PDF literal strings incl. UTF-16BE hex strings, for annotation/metadata searches */
function pdfStrings(raw: string) {
  const out: string[] = [];
  for (const m of raw.matchAll(/\(((?:\\.|[^\\)]){1,2000})\)/g)) out.push(m[1].replace(/\\(\d{3})/g, (_x, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\(.)/g, "$1"));
  for (const m of raw.matchAll(/<FEFF([0-9A-Fa-f]{4,4000})>/g)) {
    const hex = m[1]; let s = "";
    for (let i = 0; i + 3 < hex.length; i += 4) s += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
    out.push(s);
  }
  return out.join(" ");
}

export async function verifyRedaction(adminId: string, redactedVersionId: string, termsRaw: string[]) {
  const terms = termsRaw.map((t) => t.trim()).filter((t) => t.length >= 2).slice(0, 200);
  if (!terms.length) throw new DomainError("no_terms");
  const d = db();
  const v = await d.query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, redactedVersionId) });
  if (!v) throw new DomainError("not_found");
  const doc = await d.query.documents.findFirst({ where: eq(schema.documents.id, v.documentId) });
  if (doc?.kind !== "redacted" || !doc.redactedFromVersionId) throw new DomainError("not_a_redacted_copy");
  if (!v.pageCount) throw new DomainError("not_processed_yet");
  const f = await d.query.files.findFirst({ where: eq(schema.files.id, v.originalFileId) });
  const buf = await storage().get(f!.storageKey);
  const sb = sandboxOpts();

  // page rasters (as recipients will see them) → OCR
  const renders = await d.select({ page: schema.pageRenders.pageNumber, key: schema.files.storageKey, width: schema.pageRenders.width, height: schema.pageRenders.height })
    .from(schema.pageRenders).innerJoin(schema.files, eq(schema.files.id, schema.pageRenders.fileId)).where(eq(schema.pageRenders.versionId, v.id));
  const pages: PageImage[] = [];
  for (const r of renders) pages.push({ page: r.page, png: await storage().get(r.key), width: r.width, height: r.height });
  let ocr: string | null = null;
  try { ocr = await ocrPages(pages, sb); } catch { ocr = null; }

  const checks: RedactionCheck[] = [];
  checks.push(check("ocr_rendered_pages", ocr, terms, "Tesseract OCR over the exact rasters recipients receive"));

  if (f!.extension === "pdf") {
    checks.push(check("pdf_text_layer", await pdfText(buf, sb), terms));
    const fx = await pdfForensics(buf);
    checks.push(check("pdf_metadata", fx.meta, terms, "XMP/Info metadata via exiftool"));
    checks.push(check("pdf_strings_annotations_forms", fx.raw ? pdfStrings(fx.raw) : null, terms, "annotations, form fields, bookmarks, metadata strings (decompressed with qpdf)"));
    const attachments = fx.raw ? /\/EmbeddedFile\b|\/FileAttachment\b/.test(fx.raw) : null;
    checks.push({ name: "pdf_attachments", status: attachments === null ? "not_checked" : attachments ? "fail" : "pass", foundTermIndexes: [], note: attachments ? "embedded files present — remove them" : undefined });
    const eofs = (buf.toString("latin1").match(/%%EOF/g) ?? []).length;
    checks.push({ name: "pdf_incremental_updates", status: eofs > 1 ? "fail" : "pass", foundTermIndexes: [], note: eofs > 1 ? "multiple revisions: earlier content may be recoverable — re-save/flatten the file" : undefined });
    const layers = /\/OCProperties\b/.test(fx.raw ?? "");
    checks.push({ name: "pdf_optional_content_layers", status: layers ? "fail" : "pass", foundTermIndexes: [], note: layers ? "layers present — flatten" : undefined });
  } else if (["docx", "xlsx", "pptx"].includes(f!.extension!)) {
    const parts = await ooxmlParts(buf);
    const by = (re: RegExp) => parts.filter((p) => re.test(p.part)).map((p) => p.text).join(" ");
    checks.push(check("office_all_xml_parts", parts.map((p) => p.text).join(" "), terms, "every XML part, including hidden sheets, formulas, notes"));
    checks.push(check("office_comments_and_tracked_changes", by(/comments|threadedComments|people|document\.xml$/i), terms));
    checks.push(check("office_metadata", by(/^docProps\//), terms));
    const embedded = parts.some((p) => /embeddings\//.test(p.part)) || (await import("jszip")).default.loadAsync(buf).then((z) => Object.keys(z.files).some((n) => /embeddings\/|media\/.*\.(bin|ole)/i.test(n)));
    checks.push({ name: "office_embedded_objects", status: (await embedded) ? "not_checked" : "pass", foundTermIndexes: [], note: (await embedded) ? "embedded objects cannot be inspected — remove them" : undefined });
  } else {
    checks.push({ name: "image_metadata", status: "pass", foundTermIndexes: [], note: "image re-encoded on processing; viewing copy carries no EXIF" });
  }

  const result: "pass" | "fail" | "incomplete" = checks.some((c) => c.status === "fail") ? "fail" : checks.some((c) => c.status === "not_checked") ? "incomplete" : "pass";
  const [row] = await d.insert(schema.redactionChecks).values({
    redactedVersionId: v.id, sourceVersionId: doc.redactedFromVersionId, termsCount: terms.length, result, checks, checkedBy: adminId,
  }).returning();
  await audit({ actorType: "admin", actorUserId: adminId, action: "redaction.verified", targetType: "document_version", targetId: v.id, details: { result, termsCount: terms.length, checkId: row.id } });
  return row;
}

/** Manual attestation (required in addition to an automated pass) before a redacted copy can be published. */
export async function attestRedaction(adminId: string, checkId: string, attestation: string) {
  if (attestation.trim().length < 10) throw new DomainError("attestation_required");
  const [row] = await db().update(schema.redactionChecks).set({ attestedBy: adminId, attestedAt: new Date(), attestation: attestation.slice(0, 2000) })
    .where(and(eq(schema.redactionChecks.id, checkId), eq(schema.redactionChecks.result, "pass"))).returning();
  if (!row) throw new DomainError("only_passing_checks_can_be_attested");
  await audit({ actorType: "admin", actorUserId: adminId, action: "redaction.attested", targetType: "document_version", targetId: row.redactedVersionId });
  return row;
}
