import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/publishing/**/*.test.mjs"],
    testTimeout: 20_000,
  },
});
