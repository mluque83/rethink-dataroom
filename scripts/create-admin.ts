// Creates an administrator account (password + mandatory TOTP enrolment at first login).
// Usage:
//   npm run admin:create -- --email admin@example.com --name "Nombre"            (dev: random password
//        written to .local/dev-admin-credentials.txt, mode 600 — never printed or logged)
//   echo -n "$PW" | npm run admin:create -- --email ... --name ... --password-stdin   (production)
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
import { randomBytes, randomUUID } from "node:crypto";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";

function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; }

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name") ?? "Administrador";
  if (!email) throw new Error("--email is required");
  const { db, schema } = await import("../src/server/db");
  const { auth } = await import("../src/server/auth");
  const { eq } = await import("drizzle-orm");
  const d = db();
  if (await d.query.user.findFirst({ where: eq(schema.user.email, email) })) throw new Error("a user with that e-mail already exists");
  const password = process.argv.includes("--password-stdin") ? readFileSync(0, "utf8").trim() : randomBytes(18).toString("base64url");
  if (password.length < 14) throw new Error("password must be at least 14 characters");
  const ctx = await auth().$context;
  const hash = await ctx.password.hash(password);
  const id = randomUUID();
  await d.insert(schema.user).values({ id, email, name, role: "admin", emailVerified: true });
  await d.insert(schema.account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: hash });
  await d.insert(schema.auditEvents).values({ actorType: "system", action: "admin.created", targetType: "user", targetId: id, details: { email } });
  if (!process.argv.includes("--password-stdin")) {
    mkdirSync(".local", { recursive: true });
    writeFileSync(".local/dev-admin-credentials.txt", `email=${email}\npassword=${password}\n`, { mode: 0o600 });
    console.log("admin created; development password stored in .local/dev-admin-credentials.txt (mode 600). TOTP enrolment is required at first login.");
  } else console.log("admin created. TOTP enrolment is required at first login.");
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
