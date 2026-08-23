// Playwright E2E against the local integration harness (real handlers,
// in-memory store, chaos enabled). vitest owns tests/*.test.js; Playwright
// owns e2e/*.spec.js.
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  retries: 0,
  workers: 1, // shared in-memory store — keep journeys serialized
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1280, height: 900 },
  },
  webServer: {
    command: "node scripts/harness.mjs 4173",
    url: "http://localhost:4173/api/health",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
