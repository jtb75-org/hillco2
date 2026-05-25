import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const API_PORT = process.env.E2E_API_PORT ?? "8000";
const SPA_PORT = process.env.E2E_SPA_PORT ?? "5173";
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:test@localhost:5432/hillco2_test";
const E2E_AUTH_TOKEN = process.env.E2E_AUTH_BYPASS_TOKEN ?? "playwright-token";
const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${SPA_PORT}`;
const PYTHON = process.env.E2E_PYTHON ?? "python3";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  webServer: [
    {
      command:
        `${PYTHON} scripts/reset_e2e_db.py && ${PYTHON} -m uvicorn app.main:app --host 127.0.0.1 --port ` +
        API_PORT,
      cwd: path.resolve(__dirname, ".."),
      url: `http://127.0.0.1:${API_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        DATABASE_URL,
        TEST_DATABASE_URL: DATABASE_URL,
        SESSION_SECRET: "test-only-not-for-prod-aaaaaaaaaaaaaaaaaaaa",
        SESSION_HTTPS_ONLY: "false",
        GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
        GOOGLE_CLIENT_SECRET: "test-client-secret",
        ALLOWED_EMAILS: "test@example.com",
        EXPOSE_DOCS: "true",
        E2E_AUTH_BYPASS_ENABLED: "true",
        E2E_AUTH_BYPASS_TOKEN: E2E_AUTH_TOKEN,
        E2E_AUTH_EMAIL: "browser-e2e@example.com",
        E2E_AUTH_NAME: "Browser E2E",
        E2E_AUTH_ROLE: "admin",
      },
    },
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${SPA_PORT}`,
      cwd: __dirname,
      // Vite's `base: "/app/"` means the dev server serves index.html
      // at /app/, not at `/`. The readiness check must match the base.
      url: `${BASE_URL}/app/`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_BASE: `http://127.0.0.1:${API_PORT}`,
      },
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
