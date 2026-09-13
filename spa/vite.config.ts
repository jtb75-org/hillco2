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

// Local-only convenience: when VITE_E2E_HEADER is set, inject the E2E
// auth-bypass header into the proxied /api and /auth calls so a browser
// without a session (e.g. a phone/tablet previewing over the LAN) can load
// the authenticated app. Inert unless the env var is set — committed and
// prod builds are unaffected. Only enable against a backend that has the
// matching E2E_AUTH_BYPASS_* config.
const PROXY_HEADERS: Record<string, string> = {
  origin: API_BASE,
  referer: `${API_BASE}/`,
  ...(process.env.VITE_E2E_HEADER
    ? { "x-hillco2-e2e-auth": process.env.VITE_E2E_HEADER }
    : {}),
};

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
    // LAN DNS name for the dev box — Vite blocks Host headers it doesn't
    // recognize, so requests to http://local-hillco.ng20.org:5173 need it
    // allow-listed here (localhost/127.0.0.1/LAN IPs are permitted anyway).
    allowedHosts: ["local-hillco.ng20.org"],
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
        headers: PROXY_HEADERS,
      },
      "/auth": {
        target: API_BASE,
        changeOrigin: true,
        secure: true,
        headers: PROXY_HEADERS,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
  },
}));
