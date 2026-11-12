import { config } from "dotenv";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

config({ path: process.env.ENV_FILE ?? ".env.local" });

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await migrate(drizzle(pool), { migrationsFolder: "./migrations" });
  await pool.end();
  console.log("migrations applied");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
