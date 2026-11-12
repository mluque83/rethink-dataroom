import { execFileSync } from "node:child_process";
import { config } from "dotenv";
import { Pool } from "pg";
import * as OTPAuth from "otpauth";

config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await pool.query(text, params)).rows as T[];
}

/** waits for a dev-outbox message to `to` created after `since` */
export async function waitMail(to: string, since: Date, re: RegExp, timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const rows = await q<{ body_text: string }>("SELECT body_text FROM dev_outbox WHERE \"to\" = $1 AND created_at > $2 ORDER BY created_at DESC LIMIT 1", [to, since]);
    const m = rows[0] && re.exec(rows[0].body_text);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`no mail for ${to}`);
}

export function createAdmin(email: string, password: string) {
  execFileSync("node", ["--conditions=react-server", "--import", "tsx", "scripts/create-admin.ts", "--email", email, "--name", "E2E Admin", "--password-stdin"], { input: password, env: process.env });
}

export const totp = (secret: string) => new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret), digits: 6, period: 30, algorithm: "SHA1" }).generate();
