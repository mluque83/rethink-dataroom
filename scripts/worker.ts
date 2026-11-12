// Document processing worker (separate process from the web server).
// Run: npm run worker
import { config } from "dotenv";
config({ path: process.env.ENV_FILE ?? ".env.local", quiet: true });

async function main() {
  const { startWorker } = await import("../src/server/jobs");
  const { processVersion } = await import("../src/server/documents/pipeline");
  await startWorker(async (id) => {
    const t = Date.now();
    await processVersion(id);
    console.log(`[worker] processed version ${id} in ${Date.now() - t} ms`);
  });
  console.log("[worker] waiting for jobs");
}
main().catch((e) => { console.error(e); process.exit(1); });
