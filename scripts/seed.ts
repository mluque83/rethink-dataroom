// Base seed (idempotent): sections, checklist, access profiles, legal DRAFTS.
// Contains NO business data and NO demo data. Run: npm run db:seed
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { readFileSync } from "node:fs";
import path from "node:path";

async function main() {
  const { db, schema } = await import("../src/server/db");
  const { SECTIONS, PROFILES, LEGAL_TEXTS } = await import("../src/server/seed-data");
  const { eq } = await import("drizzle-orm");
  const d = db();
  for (const [i, s] of SECTIONS.entries()) {
    const existing = await d.query.sections.findFirst({ where: eq(schema.sections.code, s.code) });
    if (existing) continue;
    const [sec] = await d.insert(schema.sections).values({ code: s.code, nameEs: s.es, nameEn: s.en, sortOrder: i }).returning();
    for (const [j, title] of s.items.entries()) await d.insert(schema.checklistItems).values({ sectionId: sec.id, title, sortOrder: j });
  }
  for (const p of PROFILES) {
    await d.insert(schema.accessProfiles).values({ ...p, isBuiltin: true }).onConflictDoNothing();
  }
  for (const t of LEGAL_TEXTS) {
    let lt = await d.query.legalTexts.findFirst({ where: eq(schema.legalTexts.key, t.key) });
    if (!lt) [lt] = await d.insert(schema.legalTexts).values({ kind: t.kind, key: t.key, title: t.title }).returning();
    const hasVersion = await d.query.legalTextVersions.findFirst({ where: eq(schema.legalTextVersions.legalTextId, lt.id) });
    if (!hasVersion) {
      const body = readFileSync(path.join("content/legal", t.file), "utf8");
      await d.insert(schema.legalTextVersions).values({
        legalTextId: lt.id, versionLabel: "0.1-borrador", language: t.language, body, bodySha256: "computed-by-trigger",
        status: "draft", legalReviewStatus: "pending_legal_review", changeSummary: "Borrador inicial generado — pendiente de revisión jurídica",
      });
    }
  }
  console.log("base seed done (sections, checklist, profiles, legal drafts)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
