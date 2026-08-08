import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_BASE = "http://127.0.0.1:8000";

// Landing serves the marketing site at `/` of hillco.ng20.org. The
// consultant SPA lives at /app/, the API at /api/. Ingress (Traefik)
// path-routes between the three.
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: mode !== "production",
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: API_BASE,
        changeOrigin: true,
        secure: false,
        headers: { origin: API_BASE, referer: `${API_BASE}/` },
      },
    },
  },
}));
