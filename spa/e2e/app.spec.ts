import { expect, test } from "@playwright/test";

const E2E_AUTH_TOKEN = process.env.E2E_AUTH_BYPASS_TOKEN ?? "playwright-token";

test("authenticated app shell loads", async ({ page, baseURL }) => {
  const response = await page.context().request.get(new URL("/api/me", baseURL).toString(), {
    headers: { "x-hillco2-e2e-auth": E2E_AUTH_TOKEN },
  });
  expect(response.ok()).toBeTruthy();

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /welcome, browser/i })).toBeVisible();
  await expect(page.getByText("HillCo Portal")).toBeVisible();
  await expect(page.getByText("Browser E2E")).toBeVisible();
  await expect(page.getByRole("link", { name: /engagements/i })).toBeVisible();
});
