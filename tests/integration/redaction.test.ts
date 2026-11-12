// Requirement 13: redacted copies must not contain removed data anywhere recoverable
import { describe, test, expect, beforeAll } from "vitest";
import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { readFileSync } from "node:fs";
import { createDocument, uploadVersion, approveVersion, publishVersion, releaseUnscannedDev } from "@/server/documents/library";
import { processVersion } from "@/server/documents/pipeline";
import { verifyRedaction, attestRedaction } from "@/server/documents/redaction";
import { admin, publishedDoc } from "./fixtures";

let A: { userId: string };
beforeAll(async () => { A = await admin(); });
const SECRET = "Juan Nadie Secreto";

async function pdf(withText: boolean, box: boolean, metaTitle?: string) {
  const d = await PDFDocument.create();
  const f = await d.embedFont(StandardFonts.Helvetica);
  const p = d.addPage([595, 842]);
  p.drawText("Informe sintetico de prueba", { x: 50, y: 780, size: 18, font: f });
  if (withText) p.drawText(`Paciente: ${SECRET}`, { x: 50, y: 700, size: 16, font: f });
  if (box) p.drawRectangle({ x: 45, y: 690, width: 400, height: 30, color: rgb(0, 0, 0) }); // NOT a removal
  if (metaTitle) d.setTitle(metaTitle);
  return Buffer.from(await d.save());
}

async function redactedCopy(file: Buffer, name: string) {
  const src = await publishedDoc(A, "06");
  const doc = await createDocument(A, { title: "copy", sectionId: src.doc.sectionId }, { kind: "redacted", redactedFromVersionId: src.version.id });
  const { version } = await uploadVersion(A, doc.id, name, file);
  await processVersion(version.id);
  await releaseUnscannedDev(A, version.id);
  return version;
}

describe("redaction verification", () => {
  test("black box drawn over text is detected (text layer)", async () => {
    const v = await redactedCopy(await pdf(true, true), "bad.pdf");
    const r = await verifyRedaction(A.userId, v.id, [SECRET]);
    expect(r.result).toBe("fail");
    const checks = r.checks as { name: string; status: string }[];
    expect(checks.find((c) => c.name === "pdf_text_layer")!.status).toBe("fail");
    expect(checks.find((c) => c.name === "ocr_rendered_pages")!.status).toBe("pass"); // visually hidden, still recoverable
    expect(JSON.stringify(r)).not.toContain(SECRET); // terms are never stored
  });

  test("leftover metadata is detected", async () => {
    const v = await redactedCopy(await pdf(false, true, `Expediente ${SECRET}`), "meta.pdf");
    const r = await verifyRedaction(A.userId, v.id, [SECRET]);
    expect(r.result).toBe("fail");
    expect((r.checks as { name: string; status: string }[]).find((c) => c.name === "pdf_metadata")!.status).toBe("fail");
  });

  test("visible text is detected by OCR even without a text layer", async () => {
    const page = await (await import("sharp")).default({ create: { width: 1200, height: 400, channels: 3, background: "#ffffff" } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400"><text x="40" y="200" font-size="64" font-family="DejaVu Sans">${SECRET}</text></svg>`) }]).png().toBuffer();
    const v = await redactedCopy(page, "scan.png");
    const r = await verifyRedaction(A.userId, v.id, [SECRET]);
    expect((r.checks as { name: string; status: string }[]).find((c) => c.name === "ocr_rendered_pages")!.status).toBe("fail");
  });

  test("comments / hidden XML parts in Office files are detected", async () => {
    const zip = await JSZip.loadAsync(readFileSync("tests/fixtures/sample.docx"));
    zip.file("word/comments.xml", `<?xml version="1.0"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="0" w:author="x"><w:p><w:r><w:t>${SECRET}</w:t></w:r></w:p></w:comment></w:comments>`);
    const v = await redactedCopy(await zip.generateAsync({ type: "nodebuffer" }), "c.docx");
    const r = await verifyRedaction(A.userId, v.id, [SECRET]);
    expect(r.result).toBe("fail");
    expect((r.checks as { name: string; status: string }[]).find((c) => c.name === "office_comments_and_tracked_changes")!.status).toBe("fail");
  });

  test("a clean copy passes, but publication still needs manual attestation", async () => {
    const v = await redactedCopy(await pdf(false, true), "good.pdf");
    const r = await verifyRedaction(A.userId, v.id, [SECRET]);
    expect(r.result).toBe("pass");
    await approveVersion(A, v.id);
    await expect(publishVersion(A, v.id)).rejects.toMatchObject({ code: "publication_blocked" });
    await attestRedaction(A.userId, r.id, "He revisado todas las páginas visualmente.");
    await publishVersion(A, v.id);
  });
});
