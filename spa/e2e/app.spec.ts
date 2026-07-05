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
  await page.goto("/app/intakes");
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
  await expect(page).toHaveURL(/\/app\/intakes\/[0-9a-f-]+$/);
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
  await expect(page).toHaveURL(/\/app\/engagements\/[0-9a-f-]+$/);
}

async function expandActivityPhase(page: Page, phaseName: string) {
  // Target the phase Accordion by its slugified test ID rather than a
  // regex on the visible name. The accessible name includes the running
  // "X / Y complete" counter, which makes regex matches noisy and CI
  // sometimes flakes on the click stability check while a sibling
  // accordion is still animating expansion.
  const phaseId = phaseName.toLowerCase().replace(/\s+/g, "-");
  const phase = page.getByTestId(`phase-summary-${phaseId}`);
  await expect(phase).toBeVisible();
  if ((await phase.getAttribute("aria-expanded")) !== "true") {
    await phase.click();
  }
}

async function openEngagement(page: Page, householdName: string) {
  await page.goto("/app/engagements");
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

async function createInvoiceFixture(page: Page) {
  const suffix = Date.now().toString(36);
  const householdName = `E2E Invoice Household ${suffix}`;
  const familyResp = await page.context().request.post("/api/families", {
    data: { household_name: householdName },
  });
  expect(familyResp.ok()).toBeTruthy();
  const family = await familyResp.json();

  const parentResp = await page.context().request.post(
    `/api/families/${family.id}/parents`,
    {
      data: {
        first_name: "Billing",
        last_name: `Guardian ${suffix}`,
        email: `billing-${suffix}@example.test`,
        role: "guardian",
        is_primary_contact: true,
        is_billing_contact: true,
        street1: "1 Main St",
        postal_code: "62701",
      },
    },
  );
  expect(parentResp.ok()).toBeTruthy();

  const studentResp = await page.context().request.post(
    `/api/families/${family.id}/students`,
    {
      data: {
        first_name: "Invoice",
        last_name: `Student ${suffix}`,
        current_grade: "10",
      },
    },
  );
  expect(studentResp.ok()).toBeTruthy();
  const student = await studentResp.json();

  const engagementResp = await page.context().request.post(
    `/api/families/${family.id}/engagements`,
    {
      data: {
        student_id: student.id,
        engagement_type: "assessment",
        start_date: "2026-05-25",
        default_hourly_rate: "175.00",
      },
    },
  );
  expect(engagementResp.ok()).toBeTruthy();
  const engagement = await engagementResp.json();

  const entryResp = await page.context().request.post(
    `/api/engagements/${engagement.id}/time-entries`,
    {
      data: {
        work_date: "2026-05-25",
        hours: "0.50",
        description: "E2E invoice smoke review",
        billable: true,
      },
    },
  );
  expect(entryResp.ok()).toBeTruthy();
  return { engagement: engagement as { id: string }, householdName };
}

// Due date must stay in the future relative to the run date: a sent
// invoice past its due date renders the "Overdue" chip, and the smoke
// test asserts "Sent". A hardcoded date here rotted once already.
const INVOICE_DUE_DATE = new Date(Date.now() + 30 * 86_400_000)
  .toISOString()
  .slice(0, 10);

async function createDraftInvoiceViaBilling(page: Page) {
  const { engagement, householdName } = await createInvoiceFixture(page);
  await page.goto(`/app/engagements/${engagement.id}`);
  await page.getByLabel("Select E2E invoice smoke review").check();
  await page.getByLabel("Due date").fill(INVOICE_DUE_DATE);
  await page.getByLabel("Notes").fill("E2E invoice smoke notes");
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/app\/invoices\/[0-9a-f-]+$/);
  const invoiceId = page.url().match(/\/invoices\/([0-9a-f-]+)$/)?.[1];
  expect(invoiceId).toBeTruthy();
  const invoiceNumber = await page.getByRole("heading", { name: /^HC-/ }).textContent();
  expect(invoiceNumber).toBeTruthy();
  await expect(page.getByText("E2E invoice smoke review")).toBeVisible();
  return {
    engagement,
    householdName,
    invoiceId: invoiceId!,
    invoiceNumber: invoiceNumber!.trim(),
  };
}

test("authenticated app shell loads", async ({ page, baseURL }) => {
  await login(page, baseURL);

  await page.goto("/app/");

  await expect(page.getByRole("heading", { name: /welcome, browser/i })).toBeVisible();
  await expect(page.getByText("HillCo Portal")).toBeVisible();
  await expect(page.getByText("Browser E2E")).toBeVisible();
  await expect(page.getByRole("link", { name: /engagements/i })).toBeVisible();

  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: /Color scheme/ }).click();
  const themeDialog = page.getByRole("dialog", { name: "Color scheme" });
  await themeDialog.getByRole("button", { name: "Intake" }).click();
  await expect(themeDialog).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("hillco2.theme")))
    .toBe("intake");

  await page.reload();
  await expect(page.getByText("HillCo Portal")).toBeVisible();
  expect(await page.evaluate(() => window.localStorage.getItem("hillco2.theme"))).toBe("intake");
});

test("dashboard calendar card handles reauth state", async ({ page }) => {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "user-1",
        email: "browser-e2e@example.com",
        name: "Browser E2E",
        role: "admin",
      }),
    });
  });
  await page.route("**/api/dashboard", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        today: "2026-05-28",
        stats: {
          my_open_followups: 0,
          my_overdue_followups: 0,
          active_engagements: 0,
          outstanding_total: "0",
          overdue_invoice_count: 0,
          uninvoiced_total: "0",
        },
        my_followups: [],
        outstanding_invoices: [],
        recent_notes: [],
        audit: [],
      }),
    });
  });
  await page.route("**/api/calendar/upcoming?*", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({
        code: "reauth_required",
        detail: "Google Calendar authorization required.",
      }),
    });
  });

  await page.goto("/app/dashboard");

  await expect(page.getByRole("heading", { name: /welcome, browser/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Upcoming" })).toBeVisible();
  await expect(page.getByText("Reconnect Google Calendar to see upcoming events")).toBeVisible();
});

test("invoice list opens detail and previews PDF", async ({ page, baseURL }) => {
  await login(page, baseURL);
  const pickerFixture = await createInvoiceFixture(page);

  await page.goto("/app/invoices");
  await page.getByRole("button", { name: "New invoice" }).click();
  const startInvoiceDialog = page.getByRole("dialog", { name: "Start a new invoice" });
  await expect(
    startInvoiceDialog.getByRole("row", { name: new RegExp(pickerFixture.householdName) }),
  ).toBeVisible();
  await startInvoiceDialog
    .getByRole("row", { name: new RegExp(pickerFixture.householdName) })
    .getByRole("button", { name: "Open engagement" })
    .click();
  await expect(page).toHaveURL(new RegExp(`/app/engagements/${pickerFixture.engagement.id}$`));
  await expect(page.getByText("Create draft invoice")).toBeVisible();

  await page.goto("/app/invoices?focus=uninvoiced");
  const uninvoicedRow = page.getByRole("row", {
    name: new RegExp(pickerFixture.householdName),
  });
  await expect(uninvoicedRow).toBeVisible();
  await uninvoicedRow.getByRole("button", { name: "Create invoice" }).click();
  await expect(page).toHaveURL(/\/app\/invoices\/[0-9a-f-]+$/);
  await expect(page.getByText("E2E invoice smoke review")).toBeVisible();

  const { engagement, householdName, invoiceId, invoiceNumber } =
    await createDraftInvoiceViaBilling(page);

  await page.goto(`/app/invoices/${invoiceId}`);
  await page.getByRole("button", { name: "Send invoice email" }).click();
  const sendDialog = page.getByRole("dialog", { name: "Send invoice email" });
  await expect(sendDialog.getByLabel("To")).toHaveValue(/billing-.*@example\.test/);
  await expect(sendDialog.getByLabel("BCC")).toHaveValue("browser-e2e@example.com");
  await sendDialog.getByRole("button", { name: "Send email" }).click();
  await expect(sendDialog).toBeHidden();
  await expect(page.locator(".MuiChip-label", { hasText: /^Sent$/ })).toBeVisible();
  await expect(page.getByText("Sent emails")).toBeVisible();

  let detailResp = await page.context().request.get(`/api/invoices/${invoiceId}`);
  expect(detailResp.ok()).toBeTruthy();
  let detail = await detailResp.json();
  expect(detail.emails).toHaveLength(1);
  expect(detail.emails[0].to_address).toMatch(/^billing-.*@example\.test$/);

  await page.getByRole("button", { name: "Resend email" }).click();
  const resendDialog = page.getByRole("dialog", { name: "Resend invoice email" });
  await expect(resendDialog.getByLabel("To")).toHaveValue(detail.emails[0].to_address);
  await resendDialog.getByLabel("Subject").fill("Friendly reminder");
  await resendDialog.getByRole("button", { name: "Resend email" }).click();
  await expect(resendDialog).toBeHidden();

  detailResp = await page.context().request.get(`/api/invoices/${invoiceId}`);
  expect(detailResp.ok()).toBeTruthy();
  detail = await detailResp.json();
  expect(detail.emails).toHaveLength(2);
  expect(detail.emails[0].subject).toBe("Friendly reminder");

  await page.getByRole("button", { name: "Mark paid" }).click();
  const paidDialog = page.getByRole("dialog", { name: "Mark invoice paid" });
  await expect(paidDialog.getByLabel("Paid amount")).toHaveValue("87.5");
  await paidDialog.getByRole("button", { name: "Mark paid" }).click();
  await expect(paidDialog).toBeHidden();
  await expect(page.locator(".MuiChip-label", { hasText: /^Paid$/ })).toBeVisible();
  await expect(page.getByText("$87.50").first()).toBeVisible();

  await page.goto(`/app/engagements/${engagement.id}`);
  const lockedChip = page.getByRole("link", {
    name: `On invoice ${invoiceNumber}`,
  });
  await expect(lockedChip).toBeVisible();
  await expect(lockedChip).toHaveAttribute("href", `/app/invoices/${invoiceId}`);

  await page.goto("/app/invoices?status=all");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await page.getByLabel("Household search").fill(householdName);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("q"))
    .toBe(householdName);
  await expect(page.getByRole("row", { name: new RegExp(invoiceNumber) })).toBeVisible();

  await page.getByLabel("Due from").fill(INVOICE_DUE_DATE);
  await page.getByLabel("Due to").fill(INVOICE_DUE_DATE);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("due_from"))
    .toBe(INVOICE_DUE_DATE);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("due_to"))
    .toBe(INVOICE_DUE_DATE);
  await expect(page.getByRole("row", { name: new RegExp(invoiceNumber) })).toBeVisible();

  await page.getByRole("button", { name: "Kanban" }).click();
  // View choice now persists in localStorage, not the URL.
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("invoicesView")))
    .toBe("kanban");
  await expect(page.getByText(/^Draft \(/)).toBeVisible();
  await expect(page.getByText(/^Open \(/)).toBeVisible();
  await expect(page.getByText(/^Paid \(/)).toBeVisible();
  await expect(page.getByText(/^Void \(/)).toBeVisible();
  await page.getByRole("button", { name: new RegExp(invoiceNumber) }).click();
  await expect(page).toHaveURL(new RegExp(`/app/invoices/${invoiceId}$`));

  // Reload directly back to /invoices and confirm the kanban choice
  // survived (localStorage persistence). status=all keeps the
  // freshly-created draft invoice visible once we flip back to List
  // view below — without it the default status=open hides drafts.
  await page.goto("/app/invoices?status=all");
  await expect(page.getByText(/^Draft \(/)).toBeVisible();
  await page.getByRole("button", { name: "List" }).click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("invoicesView")))
    .toBe("list");
  await expect(page.getByRole("tab", { name: /^All / })).toBeVisible();

  await page.getByRole("row", { name: new RegExp(invoiceNumber) }).click();
  await expect(page).toHaveURL(new RegExp(`/app/invoices/${invoiceId}$`));
  await expect(page.getByRole("heading", { name: invoiceNumber })).toBeVisible();

  const pdfLink = page.getByRole("link", { name: "Preview PDF" });
  await expect(pdfLink).toBeVisible();
  const href = await pdfLink.getAttribute("href");
  expect(href).toBeTruthy();
  const response = await page.context().request.get(href!);
  expect(response.ok()).toBeTruthy();
  expect(response.headers()["content-type"]).toContain("application/pdf");
});

test("voiding a draft invoice releases source rows", async ({ page, baseURL }) => {
  await login(page, baseURL);
  const { engagement } = await createDraftInvoiceViaBilling(page);

  await page.getByRole("button", { name: "Void" }).click();
  const voidDialog = page.getByRole("dialog", { name: "Void invoice?" });
  await expect(voidDialog.getByText("uninvoiced pool")).toBeVisible();
  await voidDialog.getByRole("button", { name: "Void invoice" }).click();
  await expect(voidDialog).toBeHidden();
  await expect(page.locator(".MuiChip-label", { hasText: /^Void$/ })).toBeVisible();

  await page.goto(`/app/engagements/${engagement.id}`);
  await expect(page.getByLabel("Select E2E invoice smoke review")).toBeChecked();
  await expect(page.getByPlaceholder("What did you do?")).toBeEnabled();
});

test("engagement golden path", async ({ page, baseURL }) => {
  await login(page, baseURL);

  await page.goto("/app/engagements");
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
  // type="number" inputs strip trailing zeros, so the amount we just
  // entered ("42.50") renders as "42.5" in the row's amount field.
  await expect(page.locator('input[value="42.5"]')).toBeVisible();
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

  await page.goto("/app/engagements");
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

  await page.goto("/app/catalog");
  await expect(page).toHaveURL(/\/app\/catalog\/activities$/);
  await page.getByRole("tab", { name: "Contracts" }).click();
  await expect(page).toHaveURL(/\/app\/catalog\/contracts$/);

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
    // Long-running flow: create + convert + iterate seven phase accordions.
    // Default 30s test timeout is too tight on the ARC CI runner because
    // each phase click pays MUI's accordion expansion animation + a React
    // re-render of the rows underneath.
    test.setTimeout(60_000);
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

    await page.goto("/app/engagements");
    await page.getByPlaceholder("Search by family, student, lead, or type").fill(familyName);
    await page.getByRole("row", { name: new RegExp(familyName) }).click();

    await page.getByLabel("Engagement actions").click();
    await page.getByRole("menuitem", { name: "Delete engagement" }).click();
    await page.getByRole("dialog", { name: "Delete engagement?" }).getByRole("button", { name: "Delete" }).click();
    await expect(page).toHaveURL(/\/app\/engagements$/);

    await page.goto("/app/intakes");
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
