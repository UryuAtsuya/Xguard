import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["backend/src/**/*.test.ts", "frontend/src/**/*.test.tsx"],
    exclude: ["node_modules/**", "dist/**"],
    environment: "jsdom",
    setupFiles: ["frontend/src/test/setup.ts"],
  },
});
