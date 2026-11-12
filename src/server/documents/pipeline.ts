import "server-only";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { storage, newKey, sha256 } from "../storage";
import { scanBuffer } from "./scan";
import { validateUpload, ALLOWED } from "./validate";
import {
  officeToPdf, imageToPdf, renderPdfPages, pdfText, ooxmlVisibleText, fidelityCoverage, MAX_PAGES, RENDER_DPI,
} from "./convert";
import type { SandboxOpts } from "./sandbox";

export const sandboxOpts = (): SandboxOpts => ({
  mode: env().CONVERTER_SANDBOX, timeoutSeconds: env().CONVERTER_TIMEOUT_SECONDS, memoryMb: env().CONVERTER_MEMORY_MB,
});

async function storeFile(purpose: "viewing_pdf" | "page_render", key: string, buf: Buffer, mime: string) {
  await storage().put(key, buf, mime);
  const [f] = await db().insert(schema.files).values({
    storageKey: key, purpose, sha256: sha256(buf), sizeBytes: buf.length, mimeType: mime,
  }).returning();
  return f;
}

/**
 * Worker-side processing of a newly uploaded version:
 * malware scan → viewing PDF → page rasters → fidelity check → in_review.
 * Never publishes anything. On any conversion failure the version is blocked
 * (conversion_failed) and an admin notification is created.
 */
export async function processVersion(versionId: string) {
  const d = db();
  const v = await d.query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, versionId) });
  if (!v || !["uploaded", "processing"].includes(v.status)) return;
  await d.update(schema.documentVersions).set({ status: "processing" }).where(eq(schema.documentVersions.id, versionId));
  const file = await d.query.files.findFirst({ where: eq(schema.files.id, v.originalFileId) });
  const original = await storage().get(file!.storageKey);
  const report: Record<string, unknown> = { startedAt: new Date().toISOString() };

  try {
    // 1. malware scan (independent of conversion result)
    const scan = await scanBuffer(original, { scanner: env().SCANNER, host: env().CLAMD_HOST, port: env().CLAMD_PORT });
    await d.update(schema.documentVersions).set({ scanStatus: scan.status, scanDetail: scan.detail })
      .where(eq(schema.documentVersions.id, versionId));
    if (scan.status === "infected") throw new Error(`malware_detected: ${scan.detail}`);

    // 2. re-validate (defence in depth: worker never trusts the web tier)
    const ext = file!.extension!;
    const val = await validateUpload(`x.${ext}`, original, env().UPLOAD_MAX_MB * 1024 * 1024);
    report.validation = { errors: val.errors, warnings: val.warnings };
    if (!val.ok) throw new Error(`validation_failed: ${val.errors.join(",")}`);

    // 3. viewing PDF
    const sb = sandboxOpts();
    const family = ALLOWED[ext].family;
    const viewingPdf = family === "pdf" ? original : family === "office" ? await officeToPdf(original, ext, sb) : await imageToPdf(original);

    // 4. rasterise
    const pages = await renderPdfPages(viewingPdf, sb, RENDER_DPI);
    if (pages.length >= MAX_PAGES) throw new Error(`too_many_pages (>${MAX_PAGES - 1})`);
    report.pages = pages.length;

    // 5. fidelity
    let fidelity: "ok" | "warning" = "ok";
    const reasons: string[] = [];
    if (family === "office") {
      const src = await ooxmlVisibleText(original, ext);
      const txt = await pdfText(viewingPdf, sb);
      const cov = fidelityCoverage(src, txt);
      report.fidelity = cov;
      if (cov.coverage < 0.9) { fidelity = "warning"; reasons.push(`text_coverage_${Math.round(cov.coverage * 100)}pct`); }
    }
    for (const w of val.warnings) {
      if (["hidden_sheets_present", "comments_present", "tracked_changes_present", "embedded_objects_present"].includes(w)) {
        fidelity = "warning"; reasons.push(w);
      }
    }
    report.fidelityReasons = reasons;

    // 6. persist renditions (private keys scoped by version)
    const pdfFile = await storeFile("viewing_pdf", newKey("renditions", versionId, "pdf"), viewingPdf, "application/pdf");
    for (const p of pages) {
      const f = await storeFile("page_render", newKey("renditions", versionId, `p${p.page}`), p.png, "image/png");
      await d.insert(schema.pageRenders).values({ versionId, pageNumber: p.page, fileId: f.id, width: p.width, height: p.height })
        .onConflictDoNothing();
    }
    report.finishedAt = new Date().toISOString();
    await d.update(schema.documentVersions).set({
      status: "in_review", viewingPdfFileId: pdfFile.id, pageCount: pages.length,
      fidelityStatus: fidelity, conversionReport: report,
    }).where(eq(schema.documentVersions.id, versionId));
  } catch (e) {
    report.error = (e as Error).message.slice(0, 500);
    await d.update(schema.documentVersions).set({ status: "conversion_failed", fidelityStatus: "failed", conversionReport: report })
      .where(eq(schema.documentVersions.id, versionId));
    await d.insert(schema.notifications).values({
      kind: "processing_failed", payload: { versionId, documentId: v.documentId, error: String(report.error).slice(0, 200) },
    });
  }
}
