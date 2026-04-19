import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

const BACKEND = process.env.ICLOUDPD_WEB_BACKEND ?? "http://localhost:8000";
const API_PREFIXES = ["/auth", "/policies", "/runs", "/settings", "/mfa"];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    proxy: Object.fromEntries(
      API_PREFIXES.map((p) => [p, { target: BACKEND, changeOrigin: true }])
    ),
  },
  build: {
    outDir: "../src/icloudpd_web/web_dist",
    emptyOutDir: true,
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./tests/setup.ts",
    css: false,
  },
});
