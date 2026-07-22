import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend/admin",
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:4000",
      "/health": "http://localhost:4000",
    },
  },
  build: {
    outDir: "../../dist/frontend-admin",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["../shared/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
