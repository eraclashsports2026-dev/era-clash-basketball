import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    exclude: ["e2e/**", "node_modules/**"], // e2e/ belongs to Playwright
  },
});
