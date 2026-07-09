import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      include: ["app/game/**/*.ts"],
      provider: "v8",
    },
    environment: "node",
    include: ["app/game/**/*.test.ts"],
  },
});
