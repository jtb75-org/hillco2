import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_TOKEN = process.env.E2E_AUTH_BYPASS_TOKEN ?? "playwright-token";
const E2E_HOUSEHOLD = "E2E Golden Household";
const E2E_ACTIVITY_TITLE = "E2E status selection activity";

async function login(page: Page, baseURL: string | undefined) {
  const response = await page.context().request.get(new URL("/api/me", baseURL).toString(), {
    headers: { "x-hillco2-e2e-auth": E2E_AUTH_TOKEN },
  });
  expect(response.ok()).toBeTruthy();
}

test("authenticated app shell loads", async ({ page, baseURL }) => {
  await login(page, baseURL);

  await page.goto("/");

  await expect(page.getByRole("heading", { name: /welcome, browser/i })).toBeVisible();
  await expect(page.getByText("HillCo Portal")).toBeVisible();
  await expect(page.getByText("Browser E2E")).toBeVisible();
  await expect(page.getByRole("link", { name: /engagements/i })).toBeVisible();
});

test("engagement golden path", async ({ page, baseURL }) => {
  await login(page, baseURL);

  await page.goto("/engagements");
  await page.getByPlaceholder("Search by family, student, lead, or type").fill(E2E_HOUSEHOLD);
  await page.getByRole("row", { name: new RegExp(E2E_HOUSEHOLD) }).click();

  await expect(page.getByRole("heading", { name: /assessment/i })).toBeVisible();
  await expect(page.getByText(E2E_HOUSEHOLD)).toBeVisible();

  await page.getByRole("button", { name: "Mark sent" }).click();
  await expect(page.getByText("Sent — awaiting signature")).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: "signed-e2e-contract.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% e2e signed contract\n"),
  });
  await expect(page.getByText("Signed", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "View signed" })).toBeVisible();

  await expect(page.locator(`input[value="${E2E_ACTIVITY_TITLE}"]`)).toBeVisible();
  await page.getByLabel("Activity status").click();
  await page.getByRole("option", { name: "In progress" }).click();
  await expect(page.getByLabel("Activity status")).toContainText("In progress");

  await page.getByRole("button", { name: "Log time" }).click();
  await page.getByLabel("Hours").fill("1.25");
  await page.getByLabel("Description").fill("E2E consultation prep");
  await page.getByRole("button", { name: "Log", exact: true }).click();
  await expect(page.locator('input[value="1.25"]')).toBeVisible();
  await expect(page.getByPlaceholder("What did you do?")).toHaveValue("E2E consultation prep");

  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByLabel("Amount").fill("42.50");
  await page.getByLabel("Category").fill("Mileage");
  await page.getByLabel("Description").fill("E2E campus mileage");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.locator('input[value="42.50"]')).toBeVisible();
  await expect(page.getByPlaceholder("Category")).toHaveValue("Mileage");
  await expect(page.getByPlaceholder("Description")).toHaveValue("E2E campus mileage");

  await page.getByRole("button", { name: "Add note" }).click();
  await page.getByLabel("Title (optional)").fill("E2E golden path note");
  await page.locator(".rich-text-editor-body").fill("Golden path note body");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog", { name: "Add note" })).toBeHidden();
  await expect(page.getByText("E2E golden path note")).toBeVisible();
  await expect(page.getByText("Golden path note body").first()).toBeVisible();
});
