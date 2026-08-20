import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@realitycollective/webxr-input": fileURLToPath(
        new URL("./packages/webxr-input/src/index.ts", import.meta.url),
      ),
    },
  },
  test: {
    globals: true,
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    coverage: {
      provider: "v8",
      all: true,
      include: ["packages/webxr-input/src/**/*.ts"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});
