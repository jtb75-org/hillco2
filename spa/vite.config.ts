import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Dev mode proxies /api and /auth to the deployed backend so the SPA at
// localhost:5173 can hit a live API without standing up a local Postgres.
// Cookies pass through unchanged so a session established via the real
// /auth/login flow on hillco2.ng20.org is usable in dev (assuming you've
// already logged in there in the browser session).
//
// Override with VITE_API_BASE if you're running the FastAPI backend
// locally on a different host/port.
const API_BASE = process.env.VITE_API_BASE ?? "https://hillco2.ng20.org";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: API_BASE,
        changeOrigin: true,
        secure: true,
      },
      "/auth": {
        target: API_BASE,
        changeOrigin: true,
        secure: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
