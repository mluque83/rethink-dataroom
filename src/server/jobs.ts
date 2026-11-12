import "server-only";
import { PgBoss } from "pg-boss";
import { env } from "./env";

export const QUEUE_PROCESS = "process-version";
const g = globalThis as unknown as { __drBoss?: Promise<PgBoss> };

async function boss() {
  if (!g.__drBoss) {
    g.__drBoss = (async () => {
      const b = new PgBoss({ connectionString: env().DATABASE_URL, schema: "pgboss" });
      b.on("error", (e) => console.error("[jobs]", (e as Error).message));
      await b.start();
      await b.createQueue(QUEUE_PROCESS).catch(() => undefined);
      return b;
    })();
  }
  return g.__drBoss;
}

/** Job payloads contain only ids — never document contents, tokens or codes. */
export async function enqueueProcessing(versionId: string) {
  await (await boss()).send(QUEUE_PROCESS, { versionId }, { retryLimit: 1, expireInSeconds: 1800 });
}

export async function startWorker(handler: (versionId: string) => Promise<void>) {
  const b = await boss();
  await b.work<{ versionId: string }>(QUEUE_PROCESS, { batchSize: 1 }, async (jobs) => {
    for (const j of jobs) await handler(j.data.versionId);
  });
  return b;
}
