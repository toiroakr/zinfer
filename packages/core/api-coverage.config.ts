import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["api-coverage/*.test.ts"],
    testTimeout: 30000,
    // Missing baselines must fail locally too; updating requires an explicit --update.
    update: "none",
  },
});
