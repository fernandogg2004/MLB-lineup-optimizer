import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { pick, stubLogos } from "./helpers";

// The Statistics page: real data per game and team, section navigation, interaction, motion, layout.

interface Snap {
  teams: Record<"away" | "home", { team: string; actual: { er9: number; percentile: number }; optimal: { er9: number } }>;
}
const snap = (pk: number) => JSON.parse(readFileSync(`public/data/games/${pk}.json`, "utf8")) as Snap;
const validation = JSON.parse(readFileSync("public/data/validation.json", "utf8")) as { e4b: { n_team_games: number } };

const SECTIONS = ["overview", "optimization", "scoring", "model", "uncertainty", "validation"];
const URL = "/?lang=en#/statistics/game/849799/MIL";

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

const walk = async (page: Page) => {
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 500) {
    await page.evaluate((v) => window.scrollTo(0, v), y);
    await page.waitForTimeout(40);
  }
};

test("has one continuous page with the six sections, in order", async ({ page }) => {
  await page.goto(URL);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("From player statistics to the optimal batting order");
  const ids = await page.locator(".st-section[id]").evaluateAll((els) => els.map((e) => e.id.slice(3)));
  expect(ids).toEqual(SECTIONS);
  for (const name of ["How much does batting order matter?", "Why does the batting order change expected scoring?", "How does the model calculate expected runs?", "How certain is the optimized lineup?", "Does the model work beyond this game?"]) {
    await expect(page.getByRole("heading", { level: 2, name })).toHaveCount(1);
  }
  // The field belongs to Home.
  await expect(page.locator("#stadium")).toBeHidden();
});

test("the selected game and team drive the game-specific numbers", async ({ page }) => {
  const stat = (i: number) => page.locator(".st-kpis .stat-value").nth(i);
  const two = (v: number) => v.toFixed(3);
  await page.goto(URL);
  const mil = snap(849799).teams.away;
  await expect(stat(0)).toHaveText(two(mil.actual.er9));
  await expect(stat(1)).toHaveText(two(mil.optimal.er9));
  await pick(page, "Team", "TB");
  const tb = snap(849799).teams.home;
  await expect(stat(0)).toHaveText(two(tb.actual.er9));
  await expect(stat(1)).toHaveText(two(tb.optimal.er9));
  await expect(page.locator(".st-pos-name").first()).toHaveText("Díaz");
  await page.goto("/?lang=en#/statistics/game/849802/TB");
  const other = snap(849802);
  const side = other.teams.home.team === "TB" ? other.teams.home : other.teams.away;
  await expect(stat(0)).toHaveText(two(side.actual.er9));
  await expect(page.getByRole("combobox", { name: "Game", exact: true })).toHaveAttribute("data-value", "849802");
});

test("historical results do not change with the game", async ({ page }) => {
  const read = () => page.locator(".st-banner").textContent();
  await page.goto(URL);
  await expect(page.locator(".st-banner")).toContainText(validation.e4b.n_team_games.toLocaleString("en-US"));
  const a = await read();
  await page.goto("/?lang=en#/statistics/game/849802/TB");
  await expect(page.locator(".st-kpis")).toBeVisible();
  await expect(page.locator(".st-banner")).toHaveText(a ?? "");
});

test("section navigation scrolls, marks the current section and is not hidden behind the bars", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // jumps at once, so the position is exact
  await page.goto(URL);
  for (const s of ["Uncertainty", "Validation", "Scoring"]) {
    await page.locator(".st-nav-strip").getByRole("button", { name: s, exact: true }).click();
    const id = `#st-${s.toLowerCase()}-h`;
    await expect(page.locator(id)).toBeInViewport();
    await expect(page.locator(id)).toBeFocused();
    await expect(page.locator(".st-nav-strip").getByRole("button", { name: s, exact: true })).toHaveAttribute("aria-current", "location");
    const { top, navBottom } = await page.evaluate((i) => ({
      top: document.querySelector(i)!.getBoundingClientRect().top,
      navBottom: document.querySelector(".st-nav")!.getBoundingClientRect().bottom,
    }), id);
    expect(top).toBeGreaterThanOrEqual(navBottom);
  }
  await expect(page).toHaveURL(/#\/statistics\/game\/849799\/MIL\/scoring$/);
});

test("the active section follows the scroll, and a section address opens there", async ({ page }) => {
  await page.goto("/?lang=en#/statistics/game/849799/MIL/model");
  await expect(page.locator("#st-model-h")).toBeInViewport();
  await expect(page.locator('.st-nav-strip [aria-current="location"]')).toHaveText("Model");
  await page.evaluate(() => document.getElementById("st-uncertainty")?.scrollIntoView({ behavior: "instant" }));
  await expect(page.locator('.st-nav-strip [aria-current="location"]')).toHaveText("Uncertainty");
});

test("old method addresses open at Validation", async ({ page }) => {
  await page.goto("/?lang=en#/statistics/method");
  await expect(page.locator("#st-validation-h")).toBeInViewport();
  await expect(page).toHaveURL(/#\/statistics\/game$/);
});

test.describe("histogram", () => {
  test("tooltip states the range, count and share, by keyboard", async ({ page }) => {
    await page.goto(URL);
    const chart = page.locator(".st-story-chart .st-chart");
    await chart.focus();
    await page.keyboard.press("End");
    const tip = page.locator(".st-story-chart .st-tip");
    await expect(tip).toContainText("expected runs");
    await expect(tip).toContainText("orders");
    await expect(tip).toContainText("of all orders");
    await page.keyboard.press("Escape");
    await expect(tip).toHaveCount(0);
  });

  test("tooltip appears on hover", async ({ page, isMobile }) => {
    test.skip(isMobile, "hover");
    await page.goto(URL);
    const chart = page.locator(".st-story-chart .st-chart");
    await chart.scrollIntoViewIfNeeded();
    const box = (await chart.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator(".st-story-chart .st-tip")).toContainText("of all orders");
    await page.mouse.move(5, 300);
    await expect(page.locator(".st-story-chart .st-tip")).toHaveCount(0);
  });

  test("a fast scroll still reveals every marker, and scrolling back does not reset them", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto(URL);
    await expect(page.locator(".st-story-chart .st-chart")).toBeAttached();
    await page.evaluate(() => document.getElementById("st-scoring")?.scrollIntoView({ behavior: "instant" }));
    const on = page.locator(".st-story-chart .st-stage");
    await expect.poll(() => on.evaluateAll((els) => els.every((e) => e.hasAttribute("data-on")))).toBe(true);
    await page.evaluate(() => document.getElementById("st-optimization")?.scrollIntoView({ behavior: "instant" }));
    await page.waitForTimeout(200);
    expect(await on.evaluateAll((els) => els.every((e) => e.hasAttribute("data-on")))).toBe(true);
  });

  test("zoom keeps both orders on screen, using the stored bins", async ({ page }) => {
    await page.goto(URL);
    const bars = page.locator(".st-story-chart rect.st-bar");
    await expect(bars).toHaveCount(60);
    await page.getByRole("button", { name: "Near the top" }).click();
    const n = await bars.count();
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(60);
    await expect(page.locator(".st-story-chart .st-mark-opt")).toHaveCount(1);
    await expect(page.locator(".st-story-chart .st-mark-act")).toHaveCount(1);
  });
});

test("the ten best orders compare against the actual and optimal lineups", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator(".st-table tbody tr")).toHaveCount(10);
  await page.getByRole("button", { name: "Compare the order ranked 3" }).click();
  await expect(page.getByRole("heading", { name: "Order ranked 3" })).toBeVisible();
  const movedVsActual = await page.locator('.st-slots li[data-moved]').count();
  await page.locator(".st-compare").getByRole("button", { name: "Optimized lineup" }).click();
  const movedVsBest = await page.locator('.st-slots li[data-moved]').count();
  expect(movedVsActual).toBeGreaterThan(0);
  expect(movedVsBest).toBeLessThanOrEqual(movedVsActual);
});

test("the run chart and the inning chart keep their views distinct", async ({ page }) => {
  await page.goto(URL);
  const scoring = page.locator("#st-scoring");
  await scoring.getByRole("button", { name: "Actual lineup", exact: true }).first().click();
  await expect(scoring.locator(".st-card").first().locator("rect.st-bar-opt")).toHaveCount(0);
  await scoring.getByRole("button", { name: "Both", exact: true }).click();
  await expect(scoring.locator(".st-card").first().locator("rect.st-bar-opt")).toHaveCount(13); // 0…11 and 12+
  await scoring.getByRole("button", { name: "Cumulative" }).click();
  await expect(scoring.getByText("accumulated through the end of each inning")).toBeVisible();
});

test("state explorer: selecting a state and an outcome uses the fitted kernel", async ({ page }) => {
  await page.goto(URL);
  const model = page.locator("#st-model");
  await expect(model.locator(".st-state")).toHaveCount(24);
  await expect(model.locator('.st-state[aria-pressed="true"]')).toHaveAttribute("data-s", "1");
  await expect(model.getByText("From 0 outs, runner on first.")).toBeVisible();
  await model.locator('.st-state[data-s="23"]').click();
  await expect(model.getByText("From 2 outs, bases loaded.")).toBeVisible();
  await model.getByRole("button", { name: "Home run", exact: true }).click();
  await expect(model.locator(".st-trans")).toContainText("Runs scored: 4");
  await model.getByRole("button", { name: "Strikeout", exact: true }).click();
  await expect(model.locator(".st-trans")).toContainText("Three outs: the inning ends");
  await model.locator('.st-state[data-s="23"]').focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(":focus")).toHaveAttribute("data-s", /^(22|15)$/);
});

test("math renders as native formulas, inside expandable details", async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator("#st-overview math").first()).toBeVisible();
  const box = page.locator("#st-model details", { hasText: "Numerical truncation bound" });
  await box.locator("summary").click();
  await expect(box.locator("math")).toBeVisible();
  await expect(box).toContainText("×10");
});

test.describe("uncertainty", () => {
  test("keeps the two measures apart and shows the draws, with a zero reference", async ({ page }) => {
    await page.goto(URL);
    const u = page.locator("#st-uncertainty");
    await expect(u.getByRole("heading", { name: "Does the optimized order beat the actual one?" })).toBeVisible();
    await expect(u.getByRole("heading", { name: "Is it still the single best order?" })).toBeVisible();
    await expect(u.getByText("This is not the probability of winning")).toBeVisible();
    await expect(u.getByText(/not a classical confidence interval/)).toBeVisible();
    await page.evaluate(() => document.getElementById("st-uncertainty")?.scrollIntoView({ behavior: "instant" }));
    await expect(u.locator("rect.st-bar-neutral")).toHaveCount(24, { timeout: 30_000 });
    await expect(u.locator(".st-zero")).toHaveCount(1);
  });

  test("selecting a hitter carries across the player tables", async ({ page }) => {
    await page.goto(URL);
    const row = page.locator(".st-slotheat tbody tr").nth(2);
    await row.locator("button").click();
    await expect(row).toHaveAttribute("data-on", "true");
    await expect(page.locator('.st-pos[aria-pressed="true"]')).toHaveCount(2);
    await expect(page.locator('#st-model tr[data-on]')).toHaveCount(1);
    await pick(page, "Team", "TB");
    await expect(page.locator('.st-pos[aria-pressed="true"]')).toHaveCount(0);
  });
});

test("reduced motion shows everything at once, with no parallax", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(URL);
  await expect(page.locator(".st-reveal").last()).toHaveCSS("opacity", "1");
  expect(await page.locator(".st-par").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
  // Without the sticky story, every step and marker is already there.
  await expect(page.locator(".st-story-flat")).toHaveCount(1);
  await expect(page.locator('.st-story-chart .st-stage:not([data-on])')).toHaveCount(0);
});

test("parallax never touches the content, and runs without script on wide screens", async ({ page, isMobile }) => {
  await page.goto(URL);
  expect(await page.locator(".st-bg").evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
  const name = await page.locator(".st-par-slow").evaluate((e) => getComputedStyle(e).animationName);
  expect(name).toBe(isMobile ? "none" : "st-drift");
  const top = () => page.locator("#st-model-h").evaluate((e) => e.getBoundingClientRect().top + window.scrollY);
  const before = await top();
  await page.evaluate(() => window.scrollTo(0, 5000));
  await page.waitForTimeout(600);
  expect(await top()).toBeCloseTo(before, 0);
});

for (const theme of ["night", "day"]) {
  test(`axe finds no serious issues once every section is showing (${theme})`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto(`/?lang=en&theme=${theme}#/statistics/game/849799/TB`);
    await expect(page.locator(".st-banner")).toBeVisible();
    await walk(page);
    await page.waitForTimeout(800);
    const { violations } = await new AxeBuilder({ page }).include(".st-page").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const serious = violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
    expect(serious).toEqual([]);
  });
}

test.describe("layout", () => {
  test.skip(({ isMobile }) => isMobile, "viewport is set explicitly");
  for (const [w, h] of [[1440, 900], [1040, 700], [820, 1100], [390, 844], [360, 640]] as const) {
    for (const lang of ["en", "es"]) {
      test(`no sideways overflow at ${w}x${h} (${lang})`, async ({ page }) => {
        test.setTimeout(90_000);
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`/?lang=${lang}#/statistics/game/849799/MIL`);
        await expect(page.locator(".st-banner")).toBeVisible();
        await walk(page);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(1);
        // Charts fit their cards, and text in them stays inside the drawing.
        const clipped = await page.evaluate(() =>
          [...document.querySelectorAll(".st-chart")].flatMap((c) => {
            const box = c.getBoundingClientRect();
            return [...c.querySelectorAll("text")]
              .filter((t) => {
                const r = t.getBoundingClientRect();
                return r.left < box.left - 16 || r.right > box.right + 16;
              })
              .map((t) => t.textContent);
          }),
        );
        expect(clipped).toEqual([]);
      });
    }
  }
});
