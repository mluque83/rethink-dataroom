// Requirements 10 (watermark identity), 11 (cache isolation), 12 (no originals in viewing)
import { describe, test, expect, beforeAll } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, schema } from "@/server/db";
import { watermarkedPageFor, watermarkedDownloadFor, watermarkFor } from "@/server/documents/delivery";
import { storage, sha256 } from "@/server/storage";
import { syntheticPdf } from "../../scripts/seed-demo";
import { admin, recipient, publishedDoc } from "./fixtures";

let A: { userId: string };
beforeAll(async () => { A = await admin(); });

async function ocrFooter(png: Buffer) {
  const m = await sharp(png).metadata();
  const band = await sharp(png).extract({ left: 0, top: m.height! - 40, width: m.width!, height: 40 }).resize({ width: m.width! * 2 }).png().toBuffer();
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ocr-"));
  await fs.writeFile(path.join(dir, "f.png"), band);
  execFileSync("tesseract", [path.join(dir, "f.png"), path.join(dir, "out"), "-l", "eng", "--psm", "7"], { stdio: "ignore" });
  const t = await fs.readFile(path.join(dir, "out.txt"), "utf8");
  await fs.rm(dir, { recursive: true, force: true });
  return t;
}

describe("viewing renditions", () => {
  test("REQ10 watermark carries the right recipient (spec + OCR of burned-in pixels)", async () => {
    const d = await publishedDoc(A, "02");
    const r1 = await recipient(A.userId, { displayName: "Alice Example" });
    const r2 = await recipient(A.userId, { displayName: "Bob Example" });
    const s1 = await watermarkFor(r1);
    expect(s1.line1).toBe("RETHINK MEDICAL — CONFIDENTIAL");
    expect(s1.line2).toContain(r1.email);
    expect(s1.line3).toContain(r1.accessCode);
    expect(JSON.stringify(s1)).not.toMatch(/token|secret|session/i);
    const p1 = (await watermarkedPageFor(r1, d.version, 1))!;
    const p2 = (await watermarkedPageFor(r2, d.version, 1))!;
    const t1 = (await ocrFooter(p1)).replace(/\s/g, ""), t2 = (await ocrFooter(p2)).replace(/\s/g, "");
    expect(t1).toContain(r1.accessCode.replace(/\s/g, ""));
    expect(t1).not.toContain(r2.accessCode);
    expect(t2).toContain(r2.accessCode);
  });

  test("REQ11 derived caches are isolated per recipient, version and watermark config", async () => {
    const d = await publishedDoc(A, "02");
    const r1 = await recipient(A.userId), r2 = await recipient(A.userId);
    const a1 = (await watermarkedPageFor(r1, d.version, 1))!;
    const b1 = (await watermarkedPageFor(r2, d.version, 1))!;
    const a2 = (await watermarkedPageFor(r1, d.version, 1))!;      // cache hit
    expect(sha256(a1)).toBe(sha256(a2));
    expect(sha256(a1)).not.toBe(sha256(b1));
    const rows = await db().select().from(schema.derivedCache).where(eq(schema.derivedCache.versionId, d.version.id));
    expect(rows.filter((x) => x.recipientId === r1.id)).toHaveLength(1);
    expect(rows.filter((x) => x.recipientId === r2.id)).toHaveLength(1);
    const files = await db().select().from(schema.files).where(eq(schema.files.purpose, "derived"));
    const keyOf = (fid: string) => files.find((f) => f.id === fid)!.storageKey;
    expect(keyOf(rows.find((x) => x.recipientId === r1.id)!.fileId)).toContain(`derived/${r1.id}/`);
    // a preview rendering never reuses the recipient's entry (different watermark)
    const pv = (await watermarkedPageFor(r1, d.version, 1, { preview: true }))!;
    expect(sha256(pv)).not.toBe(sha256(a1));
  });

  test("REQ12 viewing and watermarked downloads never contain the original bytes or text layer", async () => {
    const pdf = await syntheticPdf("Original text layer MARKERXYZ", 1);
    const d = await publishedDoc(A, "02", "orig", pdf);
    const r = await recipient(A.userId);
    const page = (await watermarkedPageFor(r, d.version, 1))!;
    expect(page.subarray(1, 4).toString()).toBe("PNG");
    expect(page.includes(pdf.subarray(0, 200))).toBe(false);
    const dl = await watermarkedDownloadFor(r, d.version, "orig");
    expect(sha256(dl)).not.toBe(sha256(pdf));
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dl-"));
    await fs.writeFile(path.join(dir, "d.pdf"), dl);
    const text = execFileSync("pdftotext", [path.join(dir, "d.pdf"), "-"]).toString();
    expect(text).not.toContain("MARKERXYZ"); // rasterised: no original text layer
    await fs.rm(dir, { recursive: true, force: true });
    // originals stay under a private key prefix
    const f = await db().query.files.findFirst({ where: eq(schema.files.id, d.version.originalFileId) });
    expect(f!.storageKey.startsWith("originals/")).toBe(true);
    expect(await storage().exists(f!.storageKey)).toBe(true);
  });

  test("conversion failure blocks publication", async () => {
    const { createDocument, uploadVersion, approveVersion } = await import("@/server/documents/library");
    const { processVersion } = await import("@/server/documents/pipeline");
    const sec = (await db().query.sections.findFirst())!;
    const doc = await createDocument(A, { title: "broken", sectionId: sec.id });
    // structurally valid header but corrupt PDF body
    const { version } = await uploadVersion(A, doc.id, "x.pdf", Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2000, 7)]));
    await processVersion(version.id);
    const v = await db().query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, version.id) });
    expect(v!.status).toBe("conversion_failed");
    await expect(approveVersion(A, version.id)).rejects.toMatchObject({ code: "invalid_state" });
  });
});
