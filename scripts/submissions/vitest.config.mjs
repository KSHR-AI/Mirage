import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/submissions/**/*.test.mjs"],
    testTimeout: 20_000,
  },
});
