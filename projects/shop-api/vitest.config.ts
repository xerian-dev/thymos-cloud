import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/**/*.test.ts",
      "tests/**/*.property.test.ts",
      "src/**/*.test.ts",
      "src/**/*.property.test.ts",
    ],
  },
});
