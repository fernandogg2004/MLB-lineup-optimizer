import { expect, test } from "@playwright/test";
import { stubLogos } from "./helpers";

test.beforeEach(async ({ page }) => {
  await stubLogos(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  (page as unknown as { _errors: string[] })._errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { _errors: string[] })._errors).toEqual([]);
});

test("reference game loads with both teams and the actual score", async ({ page }) => {
  await page.goto("/?lang=en#/statistics");
  await expect(page.getByText("Reference game", { exact: true })).toBeVisible();
  await expect(page.getByText("Historical fact", { exact: true })).toBeVisible();
  const teamPicker = page.getByRole("combobox", { name: "Team", exact: true });
  await teamPicker.click();
  for (const team of ["Milwaukee Brewers", "Tampa Bay Rays"]) {
    await expect(page.getByRole("option", { name: team, exact: true })).toBeVisible();
  }
  await page.getByRole("option", { name: "Tampa Bay Rays", exact: true }).click();
  await expect(teamPicker).toHaveAttribute("data-value", "TB");
  await expect(page.getByText("Ben Williamson").first()).toBeVisible();
  await expect(page.getByText("Ryan Vilade").first()).toBeVisible();
});

test("language switch translates the interface", async ({ page }) => {
  await page.goto("/?lang=en#/statistics");
  await expect(page.getByRole("heading", { level: 1, name: "From player statistics to the optimal batting order" })).toBeVisible();
  await page.getByRole("button", { name: "Open menu" }).click();
  await page.getByRole("button", { name: "ES", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("heading", { level: 1, name: "De las estadísticas de los jugadores al orden al bate óptimo" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
});

test("simulator reorders, evaluates and resets", async ({ page }) => {
  await page.goto("/?lang=en#/statistics/simulator");
  const value = page.locator(".stat-value").first(); // simulator value
  await expect(value).toBeVisible();
  const before = await value.textContent();
  await page.getByRole("button", { name: "Load top order" }).click();
  await expect(value).not.toHaveText(before ?? "");
  await page.getByRole("button", { name: "Reset to order used" }).click();
  await expect(value).toHaveText(before ?? "");
  await page.getByRole("button", { name: /Move .* down/ }).first().click();
  await expect(value).not.toHaveText(before ?? "");
});

test("constrained search finds an order with the leadoff hitter locked", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/?lang=en#/statistics/simulator");
  const firstRow = page.locator(".sim-row").first();
  const leadoff = (await firstRow.locator(".sim-name").textContent())?.trim().split(" ")[0] ?? "";
  await firstRow.getByRole("button", { name: /^Lock / }).click();
  await page.getByRole("button", { name: "Find best order with my locks" }).click();
  await expect(page.getByText(/Best order under your constraints/)).toBeVisible({ timeout: 90_000 });
  await expect(page.locator(".sim-row").first()).toContainText(leadoff);
});

test("the old method page opens the validation section", async ({ page }) => {
  await page.goto("/?lang=en#/statistics/method");
  await expect(page.getByRole("heading", { name: "Does the model work beyond this game?" })).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
});

test("addresses from the previous site still work", async ({ page }) => {
  await page.goto("/?lang=en#/method");
  await expect(page.getByRole("heading", { name: "Does the model work beyond this game?" })).toBeVisible();
  await expect(page).toHaveURL(/#\/statistics\/game$/);
  await page.goto("/?lang=en#/game/849802");
  await expect(page.getByText("Historical fact", { exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Game", exact: true })).toHaveAttribute("data-value", "849802");
});

test("statistics page keeps the paper, code and season definitions", async ({ page }) => {
  await page.goto("/?lang=en#/statistics");
  await expect(page.getByRole("link", { name: "Paper (PDF)", exact: true })).toHaveAttribute("href", /paper\.pdf$/);
  await expect(page.getByRole("link", { name: "Source code" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Season hitting and percentiles" })).toBeVisible();
  await expect(page.getByText(/official hitting lines from the MLB Stats API/)).toBeVisible();
  await expect(page.getByRole("row", { name: /Brice Turang/ }).getByRole("cell", { name: ".816" })).toBeVisible();
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/?lang=es#/statistics");
  await expect(page.locator(".stat-value").first()).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("editing during a search cancels it instead of overwriting the user's edits (C-2)", async ({ page }) => {
  await page.goto("/?lang=en#/statistics/simulator");
  await expect(page.locator(".sim-row")).toHaveCount(9);
  const names = async () => page.locator(".sim-row .sim-name").allTextContents();
  const before = await names();
  await page.getByRole("button", { name: "Find best order with my locks" }).click();
  await expect(page.getByText(/Searching all orders/)).toBeVisible();
  const firstRow = page.locator(".sim-row").first();
  await firstRow.getByRole("button", { name: /^Lock / }).click();
  await expect(page.getByText(/Searching all orders/)).toHaveCount(0);
  await page.waitForTimeout(15_000); // longer than a full search
  expect(await names()).toEqual(before);
  await expect(page.getByText(/Best order under your constraints/)).toHaveCount(0);
  await expect(firstRow.getByRole("button", { name: /^Unlock / })).toBeVisible();
});

test("arrow buttons skip locked slots and keep focus in the row (C-3, C-4)", async ({ page }) => {
  await page.goto("/?lang=en#/statistics/simulator");
  await expect(page.locator(".sim-row")).toHaveCount(9);
  const rows = page.locator(".sim-row");
  const third = (await rows.nth(2).locator(".sim-name").textContent())?.trim() ?? "";
  await rows.nth(2).getByRole("button", { name: /^Lock / }).click();
  const fourthName = (await rows.nth(3).locator(".sim-name").textContent())?.trim().split(" ")[0] ?? "";
  await rows.nth(3).getByRole("button", { name: /Move .* up/ }).click();
  await expect(rows.nth(1)).toContainText(fourthName);
  await expect(rows.nth(2)).toContainText(third.split(" ")[0]);
  const focusedRow = await page.evaluate(() => document.activeElement?.closest(".sim-row")?.textContent ?? "");
  expect(focusedRow).toContain(fourthName);
});
