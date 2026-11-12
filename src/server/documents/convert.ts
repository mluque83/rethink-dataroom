import { promises as fs } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";
import { runSandboxed, inSandbox, makeWorkdir, type SandboxOpts } from "./sandbox";

export const RENDER_DPI = 120;
export const MAX_PAGES = 400;

const LO_PROFILE_XCU = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="MacroSecurityLevel" oor:op="fuse"><value>3</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Security/Scripting"><prop oor:name="DisableMacrosExecution" oor:op="fuse"><value>true</value></prop></item>
<item oor:path="/org.openoffice.Office.Common/Misc"><prop oor:name="UseLocking" oor:op="fuse"><value>false</value></prop></item>
</oor:items>`;

async function withWorkdir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await makeWorkdir();
  try { return await fn(dir); } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

/** Office → PDF with LibreOffice headless (macros disabled, sandboxed, no network). */
export async function officeToPdf(buf: Buffer, ext: string, sb: SandboxOpts): Promise<Buffer> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, "in", `input.${ext}`), buf, { mode: 0o600 });
    await fs.mkdir(path.join(dir, "profile", "user"), { recursive: true });
    await fs.writeFile(path.join(dir, "profile", "user", "registrymodifications.xcu"), LO_PROFILE_XCU);
    const profileUrl = `file://${inSandbox(sb, dir, "profile")}`;
    const r = await runSandboxed([
      "soffice", "--headless", "--norestore", "--nologo", "--nodefault", "--nolockcheck", "--nofirststartwizard",
      `-env:UserInstallation=${profileUrl}`, "--convert-to", "pdf", "--outdir", inSandbox(sb, dir, "out"),
      inSandbox(sb, dir, `in/input.${ext}`),
    ], dir, sb);
    const out = path.join(dir, "out", "input.pdf");
    try { return await fs.readFile(out); } catch {
      throw new Error(`conversion_failed (exit ${r.code}): ${r.stderr.slice(0, 300)}`);
    }
  });
}

/** Image → single-page PDF. Re-encoding through sharp strips EXIF/metadata. */
export async function imageToPdf(buf: Buffer): Promise<Buffer> {
  const png = await sharp(buf, { limitInputPixels: 80_000_000 }).rotate().png().toBuffer();
  const meta = await sharp(png).metadata();
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(png);
  const w = 595, h = Math.round((meta.height! / meta.width!) * 595);
  const page = pdf.addPage([w, h]);
  page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  pdf.setProducer("Rethink Medical data room"); pdf.setCreator("Rethink Medical data room");
  return Buffer.from(await pdf.save());
}

export interface PageImage { page: number; png: Buffer; width: number; height: number }

/** Rasterise every page (poppler, sandboxed). */
export async function renderPdfPages(pdf: Buffer, sb: SandboxOpts, dpi = RENDER_DPI): Promise<PageImage[]> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, "in", "doc.pdf"), pdf, { mode: 0o600 });
    const r = await runSandboxed(["pdftoppm", "-r", String(dpi), "-png", "-l", String(MAX_PAGES),
      inSandbox(sb, dir, "in/doc.pdf"), inSandbox(sb, dir, "out/page")], dir, sb);
    const files = (await fs.readdir(path.join(dir, "out"))).filter((f) => /^page-\d+\.png$/.test(f))
      .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]));
    if (!files.length) throw new Error(`render_failed (exit ${r.code}): ${r.stderr.slice(0, 300)}`);
    const out: PageImage[] = [];
    for (const f of files) {
      const png = await fs.readFile(path.join(dir, "out", f));
      const m = await sharp(png).metadata();
      out.push({ page: Number(f.match(/\d+/)![0]), png, width: m.width!, height: m.height! });
    }
    return out;
  });
}

export async function pdfPageCount(pdf: Buffer, sb: SandboxOpts): Promise<number> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, "in", "doc.pdf"), pdf);
    const r = await runSandboxed(["sh", "-c", `pdfinfo ${inSandbox(sb, dir, "in/doc.pdf")} > ${inSandbox(sb, dir, "out/info.txt")}`], dir, sb);
    const info = await fs.readFile(path.join(dir, "out", "info.txt"), "utf8").catch(() => "");
    const m = /Pages:\s+(\d+)/.exec(info);
    if (!m) throw new Error(`pdfinfo_failed (exit ${r.code})`);
    return Number(m[1]);
  });
}

/** Text layer of a PDF (poppler pdftotext, sandboxed). */
export async function pdfText(pdf: Buffer, sb: SandboxOpts): Promise<string> {
  return withWorkdir(async (dir) => {
    await fs.writeFile(path.join(dir, "in", "doc.pdf"), pdf);
    await runSandboxed(["pdftotext", "-layout", inSandbox(sb, dir, "in/doc.pdf"), inSandbox(sb, dir, "out/doc.txt")], dir, sb);
    return fs.readFile(path.join(dir, "out", "doc.txt"), "utf8").catch(() => "");
  });
}

/** OCR of rendered pages (tesseract, sandboxed). Used to verify redactions. */
export async function ocrPages(pages: PageImage[], sb: SandboxOpts, lang = "spa+eng"): Promise<string> {
  return withWorkdir(async (dir) => {
    let text = "";
    for (const p of pages) {
      await fs.writeFile(path.join(dir, "in", `p${p.page}.png`), p.png);
      await runSandboxed(["tesseract", inSandbox(sb, dir, `in/p${p.page}.png`), inSandbox(sb, dir, `out/p${p.page}`), "-l", lang],
        dir, { ...sb, timeoutSeconds: Math.max(sb.timeoutSeconds, 120) });
      text += await fs.readFile(path.join(dir, "out", `p${p.page}.txt`), "utf8").catch(() => "");
      text += "\n";
    }
    return text;
  });
}

/* ------------------------- OOXML text extraction ------------------------- */

const decode = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");

/** All text-bearing XML in an OOXML package, labelled by part (used by fidelity and redaction checks). */
export async function ooxmlParts(buf: Buffer): Promise<{ part: string; text: string }[]> {
  const zip = await JSZip.loadAsync(buf);
  const out: { part: string; text: string }[] = [];
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir || !/\.(xml|rels)$/i.test(name)) continue;
    const xml = await zip.file(name)!.async("string");
    const text = decode(xml.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    // Attribute values may also carry content (e.g. formulas are elements, but names/authors are attributes)
    const attrs = [...xml.matchAll(/\s(?:w:author|authorId|name|val|ref|description|title|descr)="([^"]{2,})"/g)].map((m) => decode(m[1])).join(" ");
    if (text || attrs) out.push({ part: name, text: `${text} ${attrs}`.trim() });
  }
  return out;
}

/** Visible body text for fidelity comparisons. */
export async function ooxmlVisibleText(buf: Buffer, ext: string): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const take = async (re: RegExp) => {
    const parts = Object.keys(zip.files).filter((n) => re.test(n)).sort();
    let s = "";
    for (const p of parts) {
      const xml = await zip.file(p)!.async("string");
      s += " " + [...xml.matchAll(/<(?:w:t|a:t|t)(?:\s[^>]*)?>([^<]*)<\/(?:w:t|a:t|t)>/g)].map((m) => decode(m[1])).join(" ");
    }
    return s;
  };
  if (ext === "docx") return take(/^word\/document\.xml$/);
  if (ext === "pptx") return take(/^ppt\/slides\/slide\d+\.xml$/);
  if (ext === "xlsx") {
    // shared strings of visible sheets are hard to isolate; use all shared strings + inline strings
    return take(/^xl\/(sharedStrings|worksheets\/sheet\d+)\.xml$/);
  }
  return "";
}

const tokens = (s: string) => (s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) ?? []);

/**
 * Fraction of distinct source words that are present in the rendered PDF text.
 * < 0.90 → warning (requires visual confirmation by an admin before publishing).
 */
export function fidelityCoverage(sourceText: string, pdfTextLayer: string) {
  const src = new Set(tokens(sourceText));
  if (src.size === 0) return { coverage: 1, sourceWords: 0, missingSample: [] as string[] };
  const dst = new Set(tokens(pdfTextLayer));
  const missing = [...src].filter((w) => !dst.has(w));
  return { coverage: 1 - missing.length / src.size, sourceWords: src.size, missingSample: missing.slice(0, 15) };
}
