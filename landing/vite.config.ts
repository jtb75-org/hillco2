import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Landing serves the marketing site at `/` of hillco2.ng20.org. The
// consultant SPA lives at /app/, the API at /api/. Ingress (Traefik)
// path-routes between the three.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  server: {
    port: 5174,
  },
});
