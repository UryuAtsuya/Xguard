import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "frontend/customer",
  publicDir: "../public",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000",
      "/health": "http://localhost:4000",
    },
  },
  build: {
    outDir: "../../dist/frontend-customer",
    emptyOutDir: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["../shared/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
