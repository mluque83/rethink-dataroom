import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";

/**
 * Server-side burned-in watermark. The browser only ever receives raster pages
 * that already contain the watermark; there is no CSS overlay to remove.
 * Deterrence + attribution signal only: it cannot prevent photographs, cropping
 * or retyping, and on its own it does not prove who leaked a document.
 */
export interface WatermarkSpec {
  line1: string; // RETHINK MEDICAL — CONFIDENTIAL
  line2: string; // Name · verified e-mail
  line3: string; // Access ID · date
  opacity: number;
  /** bump when the rendering algorithm changes to invalidate caches */
  algo: number;
}

export const WATERMARK_ALGO = 3; // 3: corporate orange (brand book)

export function buildWatermarkSpec(p: { name: string; email: string; accessCode: string; date: Date; opacity?: number }): WatermarkSpec {
  const d = p.date.toISOString().slice(0, 10);
  return {
    line1: "RETHINK MEDICAL — CONFIDENTIAL",
    line2: `${p.name} · ${p.email}`.slice(0, 120),
    line3: `${p.accessCode} · ${d} UTC`,
    opacity: Math.min(0.35, Math.max(0.08, p.opacity ?? 0.26)),
    algo: WATERMARK_ALGO,
  };
}

export const watermarkHash = (w: WatermarkSpec) => createHash("sha256").update(JSON.stringify(w)).digest("hex").slice(0, 32);

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")
  // strip characters that are invalid in XML 1.0
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "");

export function watermarkSvg(w: WatermarkSpec, width: number, height: number) {
  const fs = Math.max(12, Math.round(width / 52));
  const longest = Math.max(w.line1.length, w.line2.length, w.line3.length);
  // horizontal step derived from the longest line so neighbouring tiles never overlap
  const stepX = Math.round(Math.max(fs * 22, longest * fs * 0.64 + fs * 3)), stepY = Math.round(fs * 7.5);
  const tiles: string[] = [];
  for (let y = -height; y < height * 2; y += stepY) {
    const offset = (Math.round(y / stepY) % 2) * (stepX / 2);
    for (let x = -width; x < width * 2; x += stepX) {
      tiles.push(`<g transform="translate(${x + offset},${y})">` +
        `<text x="0" y="0" font-weight="700">${esc(w.line1)}</text>` +
        `<text x="0" y="${Math.round(fs * 1.35)}">${esc(w.line2)}</text>` +
        `<text x="0" y="${Math.round(fs * 2.7)}">${esc(w.line3)}</text></g>`);
    }
  }
  const band = Math.round(fs * 1.9);
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <g transform="rotate(-28 ${width / 2} ${height / 2})" font-family="DejaVu Sans, Inter, sans-serif" font-size="${fs}"
     fill="#ea9600" fill-opacity="${w.opacity}">${tiles.join("")}</g>
  <rect x="0" y="${height - band}" width="${width}" height="${band}" fill="#ffffff" fill-opacity="0.85"/><rect x="0" y="${height - band}" width="${width}" height="${Math.max(2, Math.round(fs * 0.18))}" fill="#ea9600"/>
  <text x="${Math.round(fs * 0.6)}" y="${height - Math.round(band * 0.32)}" font-family="DejaVu Sans, sans-serif" font-size="${Math.round(fs * 0.78)}" fill="#2f3133">${esc(`${w.line1} · ${w.line2} · ${w.line3}`)}</text>
</svg>`);
}

/** Composite the watermark into a page raster. Output is a new PNG (metadata stripped). */
export async function watermarkPage(png: Buffer, w: WatermarkSpec): Promise<Buffer> {
  const m = await sharp(png).metadata();
  const svg = watermarkSvg(w, m.width!, m.height!);
  return sharp(png).composite([{ input: svg, top: 0, left: 0 }]).png({ compressionLevel: 8 }).toBuffer();
}

/** Downloadable watermarked copy: a PDF made of the watermarked rasters (watermark flattened into pixels). */
export async function watermarkedPdf(pages: Buffer[], dpi: number, title: string): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (const p of pages) {
    const img = await pdf.embedPng(p);
    const w = (img.width * 72) / dpi, h = (img.height * 72) / dpi;
    pdf.addPage([w, h]).drawImage(img, { x: 0, y: 0, width: w, height: h });
  }
  pdf.setTitle(title); pdf.setProducer("Rethink Medical data room"); pdf.setCreator("Rethink Medical data room");
  pdf.setSubject("CONFIDENTIAL — personalised copy");
  return Buffer.from(await pdf.save());
}
