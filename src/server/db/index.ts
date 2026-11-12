import "server-only";
import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { env } from "../env";

type DB = NodePgDatabase<typeof schema>;
const g = globalThis as unknown as { __drPool?: Pool; __drDb?: DB };

export function pool(): Pool {
  if (!g.__drPool) {
    g.__drPool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
  }
  return g.__drPool;
}

export function db(): DB {
  return (g.__drDb ??= drizzle(pool(), { schema }));
}

export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];
export { schema };
