// Copies every object of the configured storage to/from a directory, with a SHA-256 manifest.
// Usage: storage-copy.ts export <dir> | import <dir> [--target-dir <localdir>]
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

async function main() {
  const [mode, dir] = process.argv.slice(2);
  const ti = process.argv.indexOf("--target-dir");
  if (ti > 0) { process.env.STORAGE_DRIVER = "local"; process.env.STORAGE_LOCAL_DIR = process.argv[ti + 1]; }
  const { storage } = await import("../src/server/storage");
  const s = storage();
  const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
  if (mode === "export") {
    const manifest: Record<string, string> = {};
    for (const prefix of ["originals/", "renditions/", "derived/", "qa/"]) {
      for (const key of await s.list(prefix)) {
        const b = await s.get(key);
        const out = path.join(dir, "objects", key);
        await fs.mkdir(path.dirname(out), { recursive: true, mode: 0o700 });
        await fs.writeFile(out, b, { mode: 0o600 });
        manifest[key] = sha(b);
      }
    }
    await fs.writeFile(path.join(dir, "storage-manifest.json"), JSON.stringify(manifest, null, 1), { mode: 0o600 });
    console.log(`exported ${Object.keys(manifest).length} objects`);
  } else if (mode === "import") {
    const manifest = JSON.parse(await fs.readFile(path.join(dir, "storage-manifest.json"), "utf8")) as Record<string, string>;
    for (const [key, h] of Object.entries(manifest)) {
      const b = await fs.readFile(path.join(dir, "objects", key));
      if (sha(b) !== h) throw new Error(`checksum mismatch for ${key}`);
      await s.put(key, b, "application/octet-stream");
    }
    console.log(`imported ${Object.keys(manifest).length} objects`);
  } else throw new Error("usage: export|import <dir>");
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
