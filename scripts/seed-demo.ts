// DEMO DATA — development only. Everything created here is flagged is_demo=true,
// uses the reserved example.test domain and synthetic files that state they are
// NOT Rethink Medical information. Refuses to run with APP_ENV=production.
// Run: npm run db:seed:demo   (after db:seed and admin:create)
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export async function syntheticPdf(title: string, pages = 2) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (let p = 1; p <= pages; p++) {
    const page = pdf.addPage([595, 842]);
    page.drawText("DEMO - DATOS SINTETICOS DE PRUEBA", { x: 50, y: 790, size: 16, font: bold, color: rgb(0.7, 0.1, 0.1) });
    page.drawText("Este documento NO contiene informacion de Rethink Medical S.L.", { x: 50, y: 770, size: 10, font });
    page.drawText(`${title} - pagina ${p}/${pages}`, { x: 50, y: 740, size: 13, font: bold });
    // test table (legibility of tables under the watermark)
    const cols = ["Columna A", "Columna B", "Columna C", "Columna D"];
    for (let r = 0; r < 12; r++) for (let c = 0; c < 4; c++) {
      const x = 50 + c * 120, y = 690 - r * 22;
      page.drawRectangle({ x, y: y - 6, width: 120, height: 22, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 0.5 });
      page.drawText(r === 0 ? cols[c] : `valor ${r}.${c}`, { x: x + 6, y, size: 9, font: r === 0 ? bold : font });
    }
    // test chart (legibility of graphics)
    for (let b = 0; b < 8; b++) page.drawRectangle({ x: 60 + b * 55, y: 150, width: 35, height: 30 + ((b * 37) % 180), color: rgb(0.1, 0.35, 0.55) });
    page.drawText("Grafico de prueba (valores arbitrarios)", { x: 60, y: 130, size: 9, font });
  }
  pdf.setTitle(`DEMO ${title}`);
  return Buffer.from(await pdf.save());
}

async function main() {
  if (process.env.APP_ENV === "production") throw new Error("demo seed refused in production");
  const { db, schema } = await import("../src/server/db");
  const { eq, and } = await import("drizzle-orm");
  const { createDocument, uploadVersion, approveVersion, publishVersion, releaseUnscannedDev } = await import("../src/server/documents/library");
  const { processVersion } = await import("../src/server/documents/pipeline");
  const { createRecipient, addRule } = await import("../src/server/recipients");
  const d = db();
  const admin = await d.query.user.findFirst({ where: eq(schema.user.role, "admin") });
  if (!admin) throw new Error("create an admin first (npm run admin:create)");
  const actor = { userId: admin.id };

  // Activate the legal DRAFTS so the local walkthrough works. They stay marked pending_legal_review.
  const drafts = await d.select().from(schema.legalTextVersions).where(eq(schema.legalTextVersions.status, "draft"));
  for (const v of drafts) {
    const active = await d.query.legalTextVersions.findFirst({ where: and(eq(schema.legalTextVersions.legalTextId, v.legalTextId), eq(schema.legalTextVersions.status, "active")) });
    if (!active) await d.update(schema.legalTextVersions).set({ status: "active", activatedAt: new Date(), activatedBy: admin.id }).where(eq(schema.legalTextVersions.id, v.id));
  }
  console.log("activated legal DRAFTS for local testing (still marked: pending legal review)");

  if (await d.query.recipients.findFirst({ where: eq(schema.recipients.isDemo, true) })) { console.log("demo data already present"); process.exit(0); }

  const secs = await d.select().from(schema.sections);
  const sec = (c: string) => secs.find((s) => s.code === c)!.id;
  const [grp] = await d.insert(schema.groups).values({ name: "DEMO — Grupo inversores", description: "Grupo de demostración", isDemo: true }).returning();
  const [org] = await d.insert(schema.organizations).values({ name: "DEMO Fondo Ficticio", kind: "investor", isDemo: true }).returning();
  const nda = (await d.query.legalTexts.findFirst({ where: eq(schema.legalTexts.key, "nda-investor") }))!;

  const docs: { code: string; title: string; publish: boolean }[] = [
    { code: "00", title: "DEMO Guía de navegación del data room", publish: true },
    { code: "02", title: "DEMO Documento de prueba con tabla (sección 02)", publish: true },
    { code: "03", title: "DEMO Documento financiero de prueba (sección 03)", publish: true },
    { code: "05", title: "DEMO Documento regulatorio de prueba (sección 05)", publish: true },
    { code: "07", title: "DEMO Documento pendiente de revisión", publish: false },
  ];
  const created: Record<string, string> = {};
  for (const x of docs) {
    const doc = await createDocument(actor, { title: x.title, sectionId: sec(x.code), isDemo: true, source: "Generado por seed-demo (sintético)", ownerName: "DEMO", confidentiality: "confidential", validityStatus: "not_applicable" });
    const { version } = await uploadVersion(actor, doc.id, `${x.title}.pdf`, await syntheticPdf(x.title), { changeSummary: "versión de demostración" });
    await processVersion(version.id);
    const v = await d.query.documentVersions.findFirst({ where: eq(schema.documentVersions.id, version.id) });
    if (v?.scanStatus === "not_configured") await releaseUnscannedDev(actor, version.id);
    if (x.publish) { await approveVersion(actor, version.id, "demo"); await publishVersion(actor, version.id); }
    created[x.code] = doc.id;
  }

  const r1 = await createRecipient(admin.id, { email: "inversor.demo@example.test", displayName: "DEMO Inversora Uno", organizationId: org.id, roleTitle: "Analista (demo)", ndaTextId: nda.id, qaEnabled: true, allowWatermarkedDownloads: true, isDemo: true, groupIds: [grp.id] });
  const r2 = await createRecipient(admin.id, { email: "asesor.demo@example.test", displayName: "DEMO Asesor Dos", roleTitle: "Asesor (demo)", ndaTextId: nda.id, qaEnabled: false, isDemo: true, groupIds: [grp.id] });
  // group can see 00, 02, 03 (download allowed); individual deny on 03 for r2 (individual restriction prevails)
  for (const c of ["00", "02", "03"]) await addRule(admin.id, { subjectType: "group", subjectId: grp.id, targetType: "section", targetId: sec(c), effect: "allow", canView: true, canDownloadWatermarked: true, canDownloadOriginal: false });
  await addRule(admin.id, { subjectType: "recipient", subjectId: r2.id, targetType: "section", targetId: sec("03"), effect: "deny", canView: true, canDownloadWatermarked: true, canDownloadOriginal: true, note: "demo: restricción individual" });
  await addRule(admin.id, { subjectType: "recipient", subjectId: r1.id, targetType: "section", targetId: sec("05"), effect: "allow", canView: true, canDownloadWatermarked: false, canDownloadOriginal: false });
  console.log("demo data created:", { recipients: [r1.email, r2.email], group: grp.name });
  process.exit(0);
}
if (process.argv[1]?.endsWith("seed-demo.ts")) main().catch((e) => { console.error(e); process.exit(1); });
