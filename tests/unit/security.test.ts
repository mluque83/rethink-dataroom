import { describe, test, expect } from "vitest";
import JSZip from "jszip";
import { readFileSync } from "node:fs";
import { validateUpload, sanitizeFilename } from "@/server/documents/validate";
import { safeRedirectPath } from "@/server/security";
import { assertSafeKey } from "@/server/storage";
import { toCsv } from "@/server/analytics";
import { watermarkSvg, buildWatermarkSpec } from "@/server/documents/watermark";
import { normalize } from "@/server/documents/redaction";

const MB = 1024 * 1024;
describe("upload validation", () => {
  test("rejects disallowed extensions", async () => expect((await validateUpload("a.exe", Buffer.from("MZ"), MB)).ok).toBe(false));
  test("rejects content that does not match the extension", async () => {
    const r = await validateUpload("report.pdf", readFileSync("tests/fixtures/sample.docx"), MB);
    expect(r.ok).toBe(false); expect(r.errors[0]).toMatch(/content_mismatch/);
  });
  test("rejects macro-enabled Office content even when renamed", async () => {
    const zip = await JSZip.loadAsync(readFileSync("tests/fixtures/sample.docx"));
    zip.file("word/vbaProject.bin", "x");
    const r = await validateUpload("x.docx", await zip.generateAsync({ type: "nodebuffer" }), MB);
    expect(r.errors).toContain("macros_not_allowed");
  });
  test("size limit", async () => expect((await validateUpload("a.pdf", Buffer.alloc(2 * MB), MB)).errors).toContain("file_too_large"));
  test("accepts a real docx", async () => expect((await validateUpload("a.docx", readFileSync("tests/fixtures/sample.docx"), MB)).ok).toBe(true));
  test("sanitises file names (display only)", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("C:\\x\\..\\evil<script>.pdf")).toBe("evil_script_.pdf");
    expect(sanitizeFilename("\u0000.hidden")).not.toMatch(/^\./);
  });
});

describe("misc security helpers", () => {
  test("open redirects are refused", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", "/%0d%0aSet-Cookie:x"]) {
      expect(safeRedirectPath(bad, "/room")).toMatch(/^\/(room|%0d%0aSet-Cookie:x)$/);
    }
    expect(safeRedirectPath("//evil.com", "/room")).toBe("/room");
    expect(safeRedirectPath("/room/qa?x=1", "/")).toBe("/room/qa?x=1");
  });
  test("storage keys cannot escape their prefixes", () => {
    expect(() => assertSafeKey("originals/../../etc/passwd")).toThrow();
    expect(() => assertSafeKey("/etc/passwd")).toThrow();
    expect(() => assertSafeKey("public/x")).toThrow();
    expect(() => assertSafeKey("originals/abc/def")).not.toThrow();
  });
  test("CSV exports neutralise formula injection", () => {
    expect(toCsv([{ a: "=HYPERLINK(\"http://x\")" }])).toContain("'=HYPERLINK");
  });
  test("watermark SVG escapes recipient-provided names", () => {
    const svg = watermarkSvg(buildWatermarkSpec({ name: "<script>&\"'", email: "a@b.c", accessCode: "RM-1", date: new Date() }), 800, 1000).toString();
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });
  test("redaction matching is case/accent/space-insensitive", () => {
    expect(normalize("JOSÉ  Pérez")).toBe(normalize("jose perez"));
  });
});
