// Applies the retention policy (cron-able). Usage: npm run retention:apply -- [--dry-run]
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });
async function main() {
  const { applyRetention } = await import("../src/server/retention");
  console.log(await applyRetention(null, { dryRun: process.argv.includes("--dry-run") }));
  process.exit(0);
}
main().catch((e) => { console.error(e.message); process.exit(1); });
