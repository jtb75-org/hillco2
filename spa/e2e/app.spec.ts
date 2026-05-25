import { expect, test, type Page } from "@playwright/test";
import { PDFParse } from "pdf-parse";

const E2E_AUTH_TOKEN = process.env.E2E_AUTH_BYPASS_TOKEN ?? "playwright-token";
const E2E_HOUSEHOLD = "E2E Golden Household";
const E2E_CONTRACT_HOUSEHOLD = "E2E Contract Household";
const E2E_ACTIVITY_TITLE = "E2E status selection activity";
const E2E_SCHOOL_NAME = "E2E Test Academy";
const SERVICES_TEMPLATE_NAME = "Standard educational consulting services agreement";
const MEDICAL_TEMPLATE_NAME = "Standard authorization for release of medical and educational information";

async function login(page: Page, baseURL: string | undefined) {
  const response = await page.context().request.get(new URL("/api/me", baseURL).toString(), {
    headers: { "x-hillco2-e2e-auth": E2E_AUTH_TOKEN },
  });
  expect(response.ok()).toBeTruthy();
}

async function createIntakeFromNewFamily(page: Page, familyName: string) {
  await page.goto("/intakes");
  // IntakesList renders a "New intake" button in the page header AND in
  // each view's empty state. When there are no intakes, both render, so
  // the strict locator resolves to >1. The header button is always first
  // in DOM order.
  await page.getByRole("button", { name: "New intake" }).first().click();
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

async function openEngagement(page: Page, householdName: string) {
  await page.goto("/engagements");
  await page.getByPlaceholder("Search by family, student, lead, or type").fill(householdName);
  await page.getByRole("row", { name: new RegExp(householdName) }).click();
  await expect(page.getByText(householdName)).toBeVisible();
}

async function pdfTextFromAgreementPreview(page: Page, agreementRow: ReturnType<Page["locator"]>) {
  const href = await agreementRow.getByRole("link", { name: "Preview PDF" }).getAttribute("href");
  expect(href).toBeTruthy();

  const response = await page.context().request.get(href!);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/pdf");

  const parser = new PDFParse({ data: await response.body() });
  const result = await parser.getText();
  await parser.destroy();
  return result.text;
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
  // Wait for the dialog to fully fade out so its still-mounted
  // "What did you do?" placeholder doesn't collide with the new row's
  // input under Playwright strict mode.
  await expect(page.getByRole("dialog", { name: /log time/i })).toBeHidden();
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

test.describe.serial("contract template agreements", () => {
  test("creates a templated draft agreement and previews the PDF", async ({
    page,
    baseURL,
  }) => {
    await login(page, baseURL);
    await openEngagement(page, E2E_CONTRACT_HOUSEHOLD);

    await page.getByRole("button", { name: "New agreement" }).click();
    const dialog = page.getByRole("dialog", { name: "New agreement" });
    await dialog.getByTestId("agreement-template-select").getByRole("combobox").click();
    await expect(page.getByRole("option", { name: SERVICES_TEMPLATE_NAME })).toBeVisible();
    await page.getByRole("option", { name: SERVICES_TEMPLATE_NAME }).click();
    await dialog.getByLabel("Amount").fill("2500");
    // Firm settings + a billing-flagged guardian with address are
    // pre-seeded in the E2E fixture, so all template variables
    // auto-fill — Create draft should enable without any inline
    // fillins.
    await dialog.getByRole("button", { name: "Create draft" }).click();
    await expect(dialog).toBeHidden();

    const agreementRow = page.locator('[data-agreement-type="services_contract"]').first();
    await expect(agreementRow.getByText("Drafted")).toBeVisible();
    await expect(agreementRow.getByRole("button", { name: "View / Edit" })).toBeVisible();
    await expect(agreementRow.getByRole("link", { name: "Preview PDF" })).toBeVisible();

    const pdfText = await pdfTextFromAgreementPreview(page, agreementRow);
    expect(pdfText).toContain("EDUCATIONAL CONSULTING SERVICES AGREEMENT");
    expect(pdfText).toContain(`the ${E2E_CONTRACT_HOUSEHOLD} family`);
    expect(pdfText).toContain("175.00");
  });

  test("contract body edits propagate to the rendered PDF", async ({
    page,
    baseURL,
  }) => {
    await login(page, baseURL);
    await openEngagement(page, E2E_CONTRACT_HOUSEHOLD);

    const agreementRow = page.locator('[data-agreement-type="services_contract"]').first();
    await agreementRow.getByRole("button", { name: "View / Edit" }).click();

    const dialog = page.getByRole("dialog", { name: "Contract body" });
    const editor = dialog.getByTestId("agreement-body-editor");
    const originalBody = await editor.inputValue();
    expect(originalBody).toContain("{{governing_state}}");
    await editor.fill(originalBody.replace("{{governing_state}}", "Indiana"));
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();
    await expect(agreementRow).toBeVisible();

    const pdfText = await pdfTextFromAgreementPreview(page, agreementRow);
    expect(pdfText).toContain("Indiana");
    expect(pdfText).not.toContain("{{governing_state}}");
  });
});

test("catalog contract templates can be created, edited, and deleted", async ({
  page,
  baseURL,
}) => {
  await login(page, baseURL);

  await page.goto("/catalog");
  await expect(page).toHaveURL(/\/catalog\/activities$/);
  await page.getByRole("tab", { name: "Contracts" }).click();
  await expect(page).toHaveURL(/\/catalog\/contracts$/);

  const servicesRow = page.getByRole("row", { name: new RegExp(SERVICES_TEMPLATE_NAME) });
  await expect(servicesRow).toContainText("client_name");
  await expect(servicesRow).toContainText("governing_state");
  const medicalRow = page.getByRole("row", { name: new RegExp(MEDICAL_TEMPLATE_NAME) });
  await expect(medicalRow).toContainText("patient_full_name");

  await page.getByRole("button", { name: "New template" }).click();
  let dialog = page.getByRole("dialog", { name: "New template" });
  await dialog.getByLabel("Name").fill("E2E test contract");
  await dialog.getByTestId("contract-template-kind-select").getByRole("combobox").click();
  await page.getByRole("option", { name: "Services contract" }).click();
  await dialog.getByTestId("contract-template-body-editor").fill("Hello {{world}} and {{universe}}");
  await expect(dialog.getByText("Detected variables (2)")).toBeVisible();
  await expect(dialog.getByTestId("contract-template-variable-chip").filter({ hasText: "world" })).toBeVisible();
  await expect(dialog.getByTestId("contract-template-variable-chip").filter({ hasText: "universe" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  const createdRow = page.getByRole("row", { name: /E2E test contract/ });
  await expect(createdRow).toContainText("world");
  await expect(createdRow).toContainText("universe");

  await page.getByLabel("Edit E2E test contract").click();
  dialog = page.getByRole("dialog", { name: "Edit template" });
  const bodyEditor = dialog.getByTestId("contract-template-body-editor");
  await expect(bodyEditor).toHaveValue("Hello {{world}} and {{universe}}");
  await bodyEditor.fill("Hello {{world}} and {{universe}} and {{galaxy}}");
  await expect(dialog.getByText("Detected variables (3)")).toBeVisible();
  await expect(dialog.getByTestId("contract-template-variable-chip").filter({ hasText: "galaxy" })).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();

  await page.getByLabel("Delete E2E test contract").click();
  const confirm = page.getByRole("dialog", { name: "Delete template?" });
  await confirm.getByRole("button", { name: "Delete" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.getByRole("row", { name: /E2E test contract/ })).toHaveCount(0);
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
