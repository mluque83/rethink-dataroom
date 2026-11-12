import { promises as fs } from "node:fs";
import path from "node:path";
import type { ObjectStorage } from "./index";
import { assertSafeKey } from "./index";

/** DEVELOPMENT ONLY: private directory (0700 dirs / 0600 files), outside /public. */
export class LocalStorage implements ObjectStorage {
  readonly kind = "local" as const;
  private root: string;
  constructor(dir: string) { this.root = path.resolve(dir); }

  private p(key: string) {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("path escape");
    return full;
  }
  async put(key: string, body: Buffer) {
    const full = this.p(key);
    await fs.mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
    const tmp = `${full}.tmp-${process.pid}-${Date.now()}`;
    await fs.writeFile(tmp, body, { mode: 0o600 });
    await fs.rename(tmp, full);
  }
  async get(key: string) { return fs.readFile(this.p(key)); }
  async exists(key: string) { try { await fs.access(this.p(key)); return true; } catch { return false; } }
  async delete(key: string) { await fs.rm(this.p(key), { force: true }); }
  async list(prefix: string) {
    const out: string[] = [];
    const walk = async (dir: string) => {
      let entries: import("node:fs").Dirent[] = [];
      try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) await walk(f);
        else if (!e.name.includes(".tmp-")) out.push(path.relative(this.root, f).split(path.sep).join("/"));
      }
    };
    await walk(path.join(this.root, prefix.split("/")[0]));
    return out.filter((k) => k.startsWith(prefix)).sort();
  }
  async health() {
    await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
    const st = await fs.stat(this.root);
    const mode = (st.mode & 0o777).toString(8);
    return {
      ok: (st.mode & 0o077) === 0,
      details: { driver: "local (development only)", permissions: mode, encryptionAtRest: "not provided by this driver (depends on host disk)" },
    };
  }
}
