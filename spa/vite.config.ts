import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Dev mode proxies /api and /auth to the deployed backend so the SPA at
// localhost:5173 can hit a live API without standing up a local Postgres.
// Cookies pass through unchanged so a session established via the real
// /auth/login flow on hillco.ng20.org is usable in dev (assuming you've
// already logged in there in the browser session).
//
// Override with VITE_API_BASE if you're running the FastAPI backend
// locally on a different host/port.
const API_BASE = process.env.VITE_API_BASE ?? "https://hillco.ng20.org";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  // SPA serves at /app/ — ingress routes /app/* to this container, with
  // /api/* and /auth/* going to the backend tier and `/` going to the
  // separate landing tier. Vite's `base` makes the built bundle reference
  // its assets under /app/, and the BrowserRouter basename mirrors it.
  base: "/app/",
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
        // Backend's CSRF middleware compares the request's Origin/Referer
        // to its own host. `changeOrigin` rewrites Host, but the browser's
        // Origin header sticks as http://localhost:5173, so POST/PATCH/
        // DELETE get rejected with "CSRF check failed: origin mismatch".
        // Spoof the upstream headers so the API sees a same-origin call.
        headers: { origin: API_BASE, referer: `${API_BASE}/` },
      },
      "/auth": {
        target: API_BASE,
        changeOrigin: true,
        secure: true,
        headers: { origin: API_BASE, referer: `${API_BASE}/` },
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
  },
}));
