// Playwright E2E against the local integration harness (real handlers,
// in-memory store, chaos enabled). vitest owns tests/*.test.js; Playwright
// owns e2e/*.spec.js.
//
// Two harnesses, deliberately: the default one runs with every preview flag
// OFF, so the existing journeys keep proving that production behaviour is
// unchanged. A second harness on 4174 runs with DAILY_COACH_ERA_ENABLED so
// the new Daily flow can be exercised as a real user WITHOUT that flag
// leaking into the isolation journeys.
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
  projects: [
    {
      name: "production-flags-off",
      testIgnore: /(daily-coach-era|phase7b-preview)\.spec\.js/,
    },
    {
      name: "daily-coach-era-preview",
      testMatch: /daily-coach-era\.spec\.js/,
      use: { baseURL: "http://localhost:4174" },
    },
    {
      // Candidate 3 surfaces (coaching detail, key moments, matchup patterns,
      // series continuity) exist only on the preview engine, which is what the
      // Wave 1 testers actually use — so they get their own harness.
      name: "candidate3-preview",
      testMatch: /phase7b-preview\.spec\.js/,
      use: { baseURL: "http://localhost:4175" },
    },
  ],
  webServer: [
    {
      command: "node scripts/harness.mjs 4173",
      url: "http://localhost:4173/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
    },
    {
      command: "node scripts/harness.mjs 4174",
      url: "http://localhost:4174/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
      env: { DAILY_COACH_ERA_ENABLED: "true" },
    },
    {
      command: "node scripts/harness.mjs 4175",
      url: "http://localhost:4175/api/health",
      reuseExistingServer: true,
      timeout: 30_000,
      env: { PREVIEW_SIM_ENGINE_ENABLED: "true", VERCEL_ENV: "preview" },
    },
  ],
});
