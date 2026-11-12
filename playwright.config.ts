import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 240_000,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "off", screenshot: "off", locale: "es-ES" },
});
