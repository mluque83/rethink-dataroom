import { fileTypeFromBuffer } from "file-type";
import JSZip from "jszip";

export const ALLOWED: Record<string, { mime: string; family: "pdf" | "office" | "image" }> = {
  pdf: { mime: "application/pdf", family: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", family: "office" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", family: "office" },
  pptx: { mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", family: "office" },
  png: { mime: "image/png", family: "image" },
  jpg: { mime: "image/jpeg", family: "image" },
  jpeg: { mime: "image/jpeg", family: "image" },
};

export interface ValidationResult {
  ok: boolean;
  ext?: string;
  mime?: string;
  family?: "pdf" | "office" | "image";
  errors: string[];
  warnings: string[];
}

const MAX_ZIP_ENTRIES = 5000;
const MAX_UNCOMPRESSED = 600 * 1024 * 1024;

/** Display-only file name sanitising. Storage keys never derive from it. */
export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.normalize("NFKC").replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_").replace(/^\.+/, "").trim();
  return (cleaned || "file").slice(0, 150);
}

export function extensionOf(name: string) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

export async function validateUpload(filename: string, buf: Buffer, maxBytes: number): Promise<ValidationResult> {
  const errors: string[] = [], warnings: string[] = [];
  const ext = extensionOf(filename);
  if (!ALLOWED[ext]) return { ok: false, errors: [`extension_not_allowed:${ext || "none"}`], warnings };
  if (buf.length === 0) return { ok: false, errors: ["empty_file"], warnings };
  if (buf.length > maxBytes) return { ok: false, errors: ["file_too_large"], warnings };

  const detected = await fileTypeFromBuffer(buf);
  const want = ALLOWED[ext];
  const detectedExt = detected?.ext === "jpg" ? (ext === "jpeg" ? "jpeg" : "jpg") : detected?.ext;
  if (!detected || detectedExt !== ext) {
    return { ok: false, errors: [`content_mismatch:declared=${ext},detected=${detected?.ext ?? "unknown"}`], warnings };
  }

  if (want.family === "office") {
    let zip: JSZip;
    try { zip = await JSZip.loadAsync(buf); } catch { return { ok: false, errors: ["corrupt_office_file"], warnings }; }
    const names = Object.keys(zip.files);
    if (names.length > MAX_ZIP_ENTRIES) errors.push("too_many_zip_entries");
    let total = 0;
    for (const n of names) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      total += ((zip.files[n] as any)._data?.uncompressedSize ?? 0) as number;
    }
    if (total > MAX_UNCOMPRESSED) errors.push("zip_bomb_suspected");
    if (names.some((n) => /vbaProject\.bin$|vbaData\.xml$/i.test(n))) errors.push("macros_not_allowed");
    const ct = await zip.file("[Content_Types].xml")?.async("string");
    if (ct && /macroEnabled|vbaProject/i.test(ct)) errors.push("macros_not_allowed");
    if (names.some((n) => /\/embeddings\//i.test(n))) warnings.push("embedded_objects_present");
    if (names.some((n) => /activeX/i.test(n))) errors.push("activex_not_allowed");
    if (names.some((n) => /comments\d*\.xml$|threadedComments/i.test(n))) warnings.push("comments_present");
    const rels = await Promise.all(names.filter((n) => n.endsWith(".rels")).map((n) => zip.file(n)!.async("string")));
    if (rels.some((r) => /TargetMode="External"/i.test(r))) warnings.push("external_links_present");
    const doc = await zip.file("word/document.xml")?.async("string");
    if (doc && /<w:(ins|del)\b/.test(doc)) warnings.push("tracked_changes_present");
    const wb = await zip.file("xl/workbook.xml")?.async("string");
    if (wb && /state="(hidden|veryHidden)"/.test(wb)) warnings.push("hidden_sheets_present");
  }

  if (want.family === "pdf") {
    const head = buf.toString("latin1");
    if (/\/JavaScript|\/JS\s*[(<]/.test(head)) warnings.push("pdf_javascript_present");
    if (/\/Launch\b/.test(head)) warnings.push("pdf_launch_action_present");
    if (/\/EmbeddedFile\b/.test(head)) warnings.push("pdf_embedded_files_present");
    if (/\/Encrypt\b/.test(head)) errors.push("pdf_encrypted_not_supported");
  }

  return { ok: errors.length === 0, ext, mime: want.mime, family: want.family, errors, warnings };
}
