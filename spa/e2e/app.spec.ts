import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_TOKEN = process.env.E2E_AUTH_BYPASS_TOKEN ?? "playwright-token";
const E2E_HOUSEHOLD = "E2E Golden Household";
const E2E_ACTIVITY_TITLE = "E2E status selection activity";
const E2E_SCHOOL_NAME = "E2E Test Academy";

async function login(page: Page, baseURL: string | undefined) {
  const response = await page.context().request.get(new URL("/api/me", baseURL).toString(), {
    headers: { "x-hillco2-e2e-auth": E2E_AUTH_TOKEN },
  });
  expect(response.ok()).toBeTruthy();
}

async function createIntakeFromNewFamily(page: Page, familyName: string) {
  await page.goto("/intakes");
  await page.getByRole("button", { name: "New intake" }).click();
  await page.getByRole("dialog", { name: "Start intake" }).getByLabel("Family").fill(familyName);
  await page.getByRole("option", { name: `+ Add "${familyName}" as a new family` }).click();

  const addFamily = page.getByRole("dialog", { name: "Add family" });
  await expect(addFamily.getByPlaceholder('e.g. "Smith Family"')).toHaveValue(familyName);
  await addFamily.getByRole("button", { name: "Add" }).click();

  const startIntake = page.getByRole("dialog", { name: "Start intake" });
  await expect(startIntake.getByLabel("Family")).toHaveValue(familyName);
  await startIntake.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/intakes\/[0-9a-f-]+$/);
}

async function addGuardian(page: Page, guardianName: string) {
  await page.getByRole("button", { name: "Add guardian", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add guardian" });
  await dialog.getByPlaceholder("Name or email").fill(guardianName);
  await page.getByRole("option", { name: `+ Add "${guardianName}" as a new guardian` }).click();
  await dialog.getByText("First name").locator("..").getByRole("textbox").fill("E2E");
  await dialog.getByText("Last name").locator("..").getByRole("textbox").fill("Guardian");
  await dialog.getByText("Email").locator("..").getByRole("textbox").fill("guardian@example.test");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toBeHidden();
}

async function addStudent(page: Page, studentName: string) {
  await page.getByRole("button", { name: "Add student", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Add student" });
  await dialog.getByPlaceholder("Name").fill(studentName);
  await page.getByRole("option", { name: `+ Add "${studentName}" as a new student` }).click();
  await dialog.getByText("First name").locator("..").getByRole("textbox").fill("E2E");
  await dialog.getByText("Last name").locator("..").getByRole("textbox").fill("Student");
  await dialog.getByText("Current grade").locator("..").getByRole("textbox").fill("8th");
  await dialog.getByRole("button", { name: "Add" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('[data-testid^="intake-candidacy-row-"]').first()).toBeVisible();
}

async function convertIntakeToAssessment(page: Page, desiredOutcome: string) {
  await page.getByTestId("intake-desired-outcome").fill(desiredOutcome);
  await page.getByTestId("intake-desired-outcome").blur();
  await page.getByPlaceholder("Add a constraint…").fill("Stay within 30 minutes of home");
  await page.keyboard.press("Enter");
  await page.getByTestId("intake-consent-control").click();

  const candidacyRow = page.locator('[data-testid^="intake-candidacy-row-"]').first();
  await candidacyRow.locator('[data-testid^="intake-candidate-control-"]').click();
  await candidacyRow.locator('[data-testid^="intake-recommended-type-"]').getByRole("combobox").click();
  await page.getByRole("option", { name: "Assessment" }).click();

  await page.getByTestId("intake-outcome-select").getByRole("combobox").click();
  await page.getByRole("option", { name: "Converting" }).click();
  await page.getByRole("button", { name: "Convert to engagement →" }).click();
  await expect(page).toHaveURL(/\/engagements\/[0-9a-f-]+$/);
}

async function expandActivityPhase(page: Page, phaseName: string) {
  const phase = page.getByRole("button", { name: new RegExp(phaseName) });
  if ((await phase.getAttribute("aria-expanded")) !== "true") {
    await phase.click();
  }
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

  const goldenActivity = page.locator(`[data-activity-title="${E2E_ACTIVITY_TITLE}"]`);
  await expect(goldenActivity.locator(`input[value="${E2E_ACTIVITY_TITLE}"]`)).toBeVisible();
  await goldenActivity.getByLabel("Activity status").click();
  await page.getByRole("option", { name: "In progress" }).click();
  await expect(goldenActivity.getByLabel("Activity status")).toContainText("In progress");

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

test("school recommendation duplicate stays in dialog with 409 detail", async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL);

  await page.goto("/engagements");
  await page.getByPlaceholder("Search by family, student, lead, or type").fill(E2E_HOUSEHOLD);
  await page.getByRole("row", { name: new RegExp(E2E_HOUSEHOLD) }).click();

  await page.getByRole("button", { name: "Add activity" }).click();
  await page.getByRole("menuitem", { name: "School recommendation" }).click();
  let dialog = page.getByRole("dialog", { name: "Add school recommendation" });
  await dialog.getByLabel("School").fill(E2E_SCHOOL_NAME);
  await page.getByRole("option", { name: new RegExp(E2E_SCHOOL_NAME) }).click();
  await dialog.getByRole("button", { name: "Create" }).click();
  try {
    await expect(dialog).toBeHidden({ timeout: 5_000 });
  } catch {
    await expect(dialog.getByText("Recommendation already exists")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
  }
  await expect(page.locator(`input[value="Recommendation: ${E2E_SCHOOL_NAME}"]`)).toHaveCount(1);

  await page.getByRole("button", { name: "Add activity" }).click();
  await page.getByRole("menuitem", { name: "School recommendation" }).click();
  dialog = page.getByRole("dialog", { name: "Add school recommendation" });
  await dialog.getByLabel("School").fill(E2E_SCHOOL_NAME);
  await page.getByRole("option", { name: new RegExp(E2E_SCHOOL_NAME) }).click();
  await dialog.getByRole("button", { name: "Create" }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("Recommendation already exists")).toBeVisible();
  await expect(page.locator(`input[value="Recommendation: ${E2E_SCHOOL_NAME}"]`)).toHaveCount(1);
});

test.describe.serial("intake conversion lifecycle", () => {
  let familyName = "";
  let desiredOutcome = "";

  test("creates an intake, converts it, and seeds assessment activities", async ({
    page,
    baseURL,
  }, testInfo) => {
    await login(page, baseURL);

    const suffix = `${Date.now()}-${testInfo.retry}`;
    familyName = `E2E Convert Family ${suffix}`;
    desiredOutcome = `Find a small assessment path for ${suffix}`;

    await createIntakeFromNewFamily(page, familyName);
    await addGuardian(page, "E2E Guardian");
    await addStudent(page, "E2E Student");
    await convertIntakeToAssessment(page, desiredOutcome);

    await expect(page.getByRole("heading", { name: /assessment/i })).toBeVisible();
    await expect(page.getByText(familyName)).toBeVisible();
    await expect(page.getByText(desiredOutcome)).toBeVisible();
    for (const phase of [
      "Client Intake",
      "Parent Interview",
      "Document Intake",
      "Document Review",
      "Profile Synthesis",
      "School Research",
      "Recommendation",
    ]) {
      await expandActivityPhase(page, phase);
    }
    await expect(page.getByText("Names and contact")).toBeVisible();
    await expect
      .poll(async () => page.getByLabel("Activity status").count())
      .toBeGreaterThanOrEqual(10);
  });

  test("deleting the converted engagement re-opens the originating intake", async ({
    page,
    baseURL,
  }) => {
    await login(page, baseURL);

    await page.goto("/engagements");
    await page.getByPlaceholder("Search by family, student, lead, or type").fill(familyName);
    await page.getByRole("row", { name: new RegExp(familyName) }).click();

    await page.getByLabel("Engagement actions").click();
    await page.getByRole("menuitem", { name: "Delete engagement" }).click();
    await page.getByRole("dialog", { name: "Delete engagement?" }).getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/engagements$/);

    await page.goto("/intakes");
    await page.getByRole("button", { name: "List" }).click();
    const row = page.getByRole("row", { name: new RegExp(familyName) });
    await expect(row).toContainText("Converting");

    await page.getByRole("button", { name: "Kanban" }).click();
    await expect(page.getByText(familyName)).toBeVisible();
    await expect(
      page.locator("div").filter({ hasText: /^In Progress/ }).filter({ hasText: familyName }).first(),
    ).toBeVisible();
  });
});
