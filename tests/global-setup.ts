// Resets the TEST database (never the development one) and applies migrations + base seed.
import { config } from "dotenv";
import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { Pool } from "pg";

export default async function setup() {
  const env = config({ path: ".env.test.local", quiet: true, processEnv: {} }).parsed!;
  if (!/dataroom_test/.test(env.DATABASE_URL)) throw new Error("refusing to reset a non-test database");
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  await pool.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA public;");
  await pool.end();
  rmSync(".local/storage-test", { recursive: true, force: true });
  const e = { ...process.env, ENV_FILE: ".env.test.local" };
  execFileSync("npx", ["tsx", "scripts/migrate.ts"], { env: e, stdio: "inherit" });
  execFileSync("node", ["--conditions=react-server", "--import", "tsx", "scripts/seed.ts"], { env: e, stdio: "inherit" });
}
