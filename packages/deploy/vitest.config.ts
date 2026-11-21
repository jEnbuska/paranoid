// Vitest's settings for packages/deploy's unit tests (pnpm test).
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // describe, it and expect without importing them
    globals: true,
    // Tests in __tests__ folders and *.test.ts or *.spec.ts files
    include: ["**/__tests__/**/*.ts", "**/?(*.)+(spec|test).ts"],
  },
});
