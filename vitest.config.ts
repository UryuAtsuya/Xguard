import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "backend/src/**/*.test.ts",
      "frontend/{customer,admin}/src/**/*.test.{ts,tsx}",
      "sites/**/*.test.ts",
    ],
    exclude: ["node_modules/**", "dist/**"],
    environment: "jsdom",
    setupFiles: ["frontend/shared/test/setup.ts"],
  },
});
