import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  (page as unknown as { _errors: string[] })._errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { _errors: string[] })._errors).toEqual([]);
});

test("reference game loads with both teams and the actual score", async ({ page }) => {
  await page.goto("/?lang=en#/");
  await expect(page.getByText("Reference game", { exact: true })).toBeVisible();
  await expect(page.getByText("Historical fact", { exact: true })).toBeVisible();
  for (const team of ["Milwaukee Brewers", "Tampa Bay Rays"]) {
    await expect(page.getByRole("tab", { name: team })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Tampa Bay Rays" }).click();
  await expect(page.getByText("Ben Williamson").first()).toBeVisible();
  await expect(page.getByText("Ryan Vilade").first()).toBeVisible();
});

test("language switch translates the interface", async ({ page }) => {
  await page.goto("/?lang=en#/");
  await expect(page.getByText("Did the managers use the best batting order?")).toBeVisible();
  await page.getByRole("button", { name: /Español/ }).click();
  await expect(page.getByText("¿Usaron los mánagers el mejor orden al bate?")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("simulator reorders, evaluates and resets", async ({ page }) => {
  await page.goto("/?lang=en#/");
  const value = page.locator(".stat-value").nth(4);
  const before = await value.textContent();
  await page.getByRole("button", { name: "Load optimal order" }).click();
  await expect(value).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Reset to order used" }).click();
  await expect(value).toHaveText(before ?? "");
  await page.getByRole("button", { name: /Move .* down/ }).first().click();
  await expect(value).not.toHaveText(before ?? "");
});

test("constrained search finds an order with the leadoff hitter locked", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?lang=en#/");
  const firstRow = page.locator(".sim-row").first();
  const leadoff = (await firstRow.locator("span.flex-1").textContent())?.trim().split(" ")[0] ?? "";
  await firstRow.getByRole("button", { name: /Lock|🔓/ }).click();
  await page.getByRole("button", { name: "Find best order with my locks" }).click();
  await expect(page.getByText(/Best order under your constraints/)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".sim-row").first()).toContainText(leadoff);
});

test("method page renders validation results", async ({ page }) => {
  await page.goto("/?lang=en#/method");
  await expect(page.getByRole("heading", { name: "Method and validation" })).toBeVisible();
  await expect(page.getByText("Limitations")).toBeVisible();
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/?lang=es#/");
  await expect(page.locator(".stat-value").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
