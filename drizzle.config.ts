import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: process.env.ENV_FILE ?? ".env.local" });

export default defineConfig({
  schema: "./src/server/db/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
