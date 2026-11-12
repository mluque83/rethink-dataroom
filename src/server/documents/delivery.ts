import "server-only";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { storage, newKey, sha256 } from "../storage";
import { buildWatermarkSpec, watermarkHash, watermarkPage, watermarkedPdf, type WatermarkSpec } from "./watermark";
import { RENDER_DPI } from "./convert";
import { getSetting } from "../settings";
import type { Recipient, DocumentVersion } from "../db/schema";

export async function watermarkFor(recipient: Pick<Recipient, "displayName" | "email" | "accessCode">, opts: { preview?: boolean } = {}): Promise<WatermarkSpec> {
  const cfg = await getSetting("watermark");
  const spec = buildWatermarkSpec({ name: recipient.displayName, email: recipient.email, accessCode: recipient.accessCode, date: new Date(), opacity: cfg.opacity });
  if (opts.preview) spec.line1 = `ADMIN PREVIEW — ${spec.line1}`;
  return spec;
}

/**
 * Derived files are cached per (recipient, version, watermark hash, kind, page).
 * The recipient id is part of the unique key AND of the storage key, so one
 * person's personalised rendering can never be served to another.
 */
async function cached(recipientId: string, versionId: string, spec: WatermarkSpec, kind: "page" | "download_pdf", page: number,
  produce: () => Promise<Buffer>, mime: string): Promise<Buffer> {
  const d = db();
  const h = watermarkHash(spec);
  const hit = await d.select({ key: schema.files.storageKey }).from(schema.derivedCache)
    .innerJoin(schema.files, eq(schema.files.id, schema.derivedCache.fileId))
    .where(and(eq(schema.derivedCache.recipientId, recipientId), eq(schema.derivedCache.versionId, versionId),
      eq(schema.derivedCache.watermarkHash, h), eq(schema.derivedCache.kind, kind), eq(schema.derivedCache.pageNumber, page)));
  if (hit[0]) {
    try { return await storage().get(hit[0].key); } catch { /* fall through and regenerate */ }
  }
  const buf = await produce();
  const key = newKey("derived", recipientId, versionId, h, `${kind}-${page}`);
  await storage().put(key, buf, mime);
  const [f] = await d.insert(schema.files).values({ storageKey: key, purpose: "derived", sha256: sha256(buf), sizeBytes: buf.length, mimeType: mime }).returning();
  await d.insert(schema.derivedCache).values({ recipientId, versionId, watermarkHash: h, kind, pageNumber: page, fileId: f.id }).onConflictDoNothing();
  return buf;
}

async function basePage(versionId: string, page: number) {
  const r = await db().select({ key: schema.files.storageKey }).from(schema.pageRenders)
    .innerJoin(schema.files, eq(schema.files.id, schema.pageRenders.fileId))
    .where(and(eq(schema.pageRenders.versionId, versionId), eq(schema.pageRenders.pageNumber, page)));
  if (!r[0]) return null;
  return storage().get(r[0].key);
}

export async function watermarkedPageFor(recipient: Recipient, version: DocumentVersion, page: number, opts: { preview?: boolean } = {}) {
  if (!Number.isInteger(page) || page < 1 || page > (version.pageCount ?? 0)) return null;
  const spec = await watermarkFor(recipient, opts);
  const base = await basePage(version.id, page);
  if (!base) return null;
  return cached(recipient.id, version.id, spec, "page", page, () => watermarkPage(base, spec), "image/png");
}

export async function watermarkedDownloadFor(recipient: Recipient, version: DocumentVersion, title: string) {
  const spec = await watermarkFor(recipient);
  return cached(recipient.id, version.id, spec, "download_pdf", 0, async () => {
    const pages: Buffer[] = [];
    for (let p = 1; p <= (version.pageCount ?? 0); p++) {
      const base = await basePage(version.id, p);
      if (base) pages.push(await watermarkPage(base, spec));
    }
    return watermarkedPdf(pages, RENDER_DPI, title);
  }, "application/pdf");
}

export async function originalFor(version: DocumentVersion) {
  const f = await db().query.files.findFirst({ where: eq(schema.files.id, version.originalFileId) });
  if (!f) return null;
  return { buf: await storage().get(f.storageKey), mime: f.mimeType, ext: f.extension ?? "bin" };
}
