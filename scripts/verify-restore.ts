// Compares a restored DB/storage against expectations: table counts vs source (when given),
// every file present with matching SHA-256, acceptance chain verifies.
import { Pool } from "pg";
import { createHash } from "node:crypto";

async function main() {
  const target = new Pool({ connectionString: process.env.DATABASE_URL });
  const { storage } = await import("../src/server/storage");
  const tables = ["documents", "document_versions", "files", "recipients", "access_rules", "acceptances", "audit_events", "activity_events", "legal_text_versions"];
  const count = async (p: Pool) => Object.fromEntries(await Promise.all(tables.map(async (t) => [t, Number((await p.query(`SELECT count(*) n FROM ${t}`)).rows[0].n)])));
  const restored = await count(target);
  let ok = true;
  if (process.env.SOURCE_URL) {
    const src = new Pool({ connectionString: process.env.SOURCE_URL });
    const source = await count(src); await src.end();
    for (const t of tables) if (source[t] !== restored[t]) { ok = false; console.error(`count mismatch ${t}: ${source[t]} vs ${restored[t]}`); }
  }
  const files = (await target.query("SELECT storage_key, sha256 FROM files")).rows as { storage_key: string; sha256: string }[];
  let bad = 0;
  for (const f of files) {
    try { const b = await storage().get(f.storage_key); if (createHash("sha256").update(b).digest("hex") !== f.sha256) bad++; } catch { bad++; }
  }
  if (bad) { ok = false; console.error(`${bad} file(s) missing or corrupted`); }
  const chain = (await target.query("SELECT count(*) FILTER (WHERE NOT (link_ok AND record_ok AND text_ok)) bad, count(*) n FROM dr_verify_acceptance_chain()")).rows[0];
  if (Number(chain.bad)) { ok = false; console.error("acceptance chain broken after restore"); }
  await target.end();
  console.log(JSON.stringify({ restored, files: files.length, acceptanceRecords: Number(chain.n) }));
  console.log(ok ? "RESTORE VERIFIED" : "RESTORE FAILED");
  process.exit(ok ? 0 : 1);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
