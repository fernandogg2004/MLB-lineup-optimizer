import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
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

const summary = (page: Page) => page.locator(".summary");
const toSummary = async (page: Page) => {
  await page.evaluate(() => {
    const s = document.querySelector<HTMLElement>(".scroller")!;
    s.scrollTop = 9 * s.querySelector<HTMLElement>(".screen")!.offsetHeight;
  });
  await expect(summary(page)).toHaveAttribute("data-on", "true");
};

test.describe("summary content", () => {
  test("Tampa Bay: title, key numbers and charts", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/TB/summary");
    const s = summary(page);
    await expect(s.locator("h2")).toHaveText("This is a modest upgrade");
    await expect(s.locator(".sum-sub")).toHaveText("What the model expects from the Tampa Bay Rays with their optimized batting order in this game.");
    const runs = s.locator(".sum-runs");
    await expect(runs.locator(".sum-label")).toHaveText("Expected runs");
    await expect(runs.locator(".sum-number")).toHaveText("3.36", { timeout: 5000 });
    await expect(runs.locator(".sum-good")).toHaveText("That's0.11 runs betterthan the worst lineup");
    const beats = s.locator(".sum-beats");
    await expect(beats.locator(".sum-label")).toHaveText("Beats actual lineup in");
    await expect(beats.locator(".sum-number")).toHaveText("99+/100", { timeout: 5000 });
    await expect(beats.locator(".sum-label-after")).toHaveText("simulations of player ability");
    await expect(beats.locator(".icon-gold")).toHaveCSS("color", "rgb(244, 185, 35)");
    await expect(s.locator(".sum-compare figcaption")).toHaveText("Comparison of expected runs");
    await expect(s.locator(".cmp-label")).toHaveText(["Optimized lineup", "Actual lineup"]);
    await expect(s.locator(".cmp-value")).toHaveText(["3.36", "3.34"]);
    await expect(s.locator(".cmp-diff")).toHaveText("+0.02runs per game");
    await expect(s.locator(".sum-dist figcaption")).toHaveText("Probability of scoring n runs");
    await expect(s.locator(".seg-label b")).toHaveText(["0", "1", "2", "3", "4", "5+"]);
    await expect(s.locator(".seg-pct")).toHaveText(["11%", "16%", "17%", "15%", "13%", "28%"], { timeout: 5000 });
    await expect(s.locator(".seg")).toHaveAttribute("aria-label", "Chance of each number of runs: 0 runs: 11%, 1 runs: 16%, 2 runs: 17%, 3 runs: 15%, 4 runs: 13%, 5+ runs: 28%.");
    await expect(s.locator(".sum-foot")).toContainText("All numbers above are model estimates.");
  });

  test("Milwaukee: a smaller gain and a whole number of simulations", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/summary");
    await expect(summary(page).locator("h2")).toHaveText("This is a small upgrade");
    await expect(summary(page).locator(".sum-beats .sum-number")).toHaveText("91/100", { timeout: 5000 });
    await expect(summary(page).locator(".cmp-diff strong")).toHaveText("+0.01");
  });

  test("Spanish, with its own number format", async ({ page }) => {
    await page.goto("/?lang=es#/g/849799/MIL/summary");
    const s = summary(page);
    await expect(s.locator("h2")).toHaveText("Es una mejora pequeña");
    await expect(s.locator(".sum-runs .sum-number")).toHaveText("3,84", { timeout: 5000 });
    await expect(s.locator(".sum-good").first()).toHaveText("Son0,05 carreras másque la peor alineación");
    await expect(s.locator(".sum-beats .sum-label-after")).toHaveText("simulaciones de la habilidad de los jugadores");
    await expect(s.locator(".seg-pct").first()).toHaveText("8 %", { timeout: 5000 });
  });

  test("each run group uses the pie's colours, and the groups total 100", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/TB/summary");
    await expect(page.locator(".seg-part")).toHaveCount(6);
    await expect(page.locator(".seg-pct").first()).toHaveText("11%", { timeout: 5000 });
    const parts = await page.locator(".seg-part").evaluateAll((all) => all.map((p) => getComputedStyle(p).backgroundColor));
    const pie = await page.evaluate(() =>
      ["--pie-k", "--pie-gb", "--pie-air", "--pie-xbh", "--pie-single", "--pie-hr"].map((v) => {
        const probe = document.createElement("span");
        probe.style.background = `var(${v})`;
        document.body.append(probe);
        const c = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return c;
      }),
    );
    expect(parts).toEqual(pie);
    const pcts = (await page.locator(".seg-pct").allTextContents()).map((p) => Number(p.replace("%", "")));
    expect(pcts.reduce((a, b) => a + b, 0)).toBe(100);
  });
});

test.describe("summary motion", () => {
  test("bars and segments grow and the ball flies in when the screen is reached, every time", async ({ page, isMobile }) => {
    test.skip(isMobile, "the same code; one project is enough");
    await page.goto("/?lang=en#/g/849799/TB/1");
    await expect(page.locator(".fly")).not.toHaveClass(/fly-on/);
    await expect(page.locator(".fly")).toHaveCSS("opacity", "0");
    const fill = page.locator(".cmp-opt .cmp-fill");
    await toSummary(page);
    await page.waitForTimeout(300);
    const early = await fill.evaluate((e) => e.getBoundingClientRect().width);
    const track = await page.locator(".cmp-opt .cmp-track").evaluate((e) => e.getBoundingClientRect().width);
    expect(early).toBeLessThan(track * 0.9);
    await expect.poll(() => fill.evaluate((e) => e.getBoundingClientRect().width), { timeout: 4000 }).toBeGreaterThan(track - 4);
    // The run groups fill the whole bar once grown.
    await expect.poll(() => page.locator(".seg-part").evaluateAll((all) => all.reduce((a, p) => a + p.getBoundingClientRect().width, 0)), { timeout: 4000 })
      .toBeGreaterThan(await page.locator(".seg-bar").evaluate((e) => e.getBoundingClientRect().width - 2));
    // The ball stops in mid-air and stays there.
    await expect(page.locator(".fly")).toHaveClass(/fly-on/);
    await expect.poll(() => page.locator(".fly-ball").evaluate((e) => e.getAnimations().every((a) => a.playState === "finished"))).toBe(true);
    const rest = await page.locator(".fly-ball").boundingBox();
    await page.waitForTimeout(500);
    expect(await page.locator(".fly-ball").boundingBox()).toEqual(rest);
    // Leave and come back: it plays again.
    await page.evaluate(() => {
      const s = document.querySelector<HTMLElement>(".scroller")!;
      s.scrollTop = 8 * s.querySelector<HTMLElement>(".screen")!.offsetHeight;
    });
    await expect(summary(page)).not.toHaveAttribute("data-on", "true");
    await toSummary(page);
    await page.waitForTimeout(150);
    expect(await page.locator(".fly-ball").evaluate((e) => e.getAnimations().some((a) => a.playState === "running"))).toBe(true);
  });

  test("reduced motion shows everything at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?lang=en#/g/849799/TB/summary");
    await expect(summary(page).locator(".sum-runs .sum-number")).toHaveText("3.36");
    const track = await page.locator(".cmp-opt .cmp-track").evaluate((e) => e.getBoundingClientRect().width);
    expect(await page.locator(".cmp-opt .cmp-fill").evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(track - 4);
    expect(await page.locator(".fly-ball").evaluate((e) => e.getAnimations().length)).toBe(0);
  });
});

test.describe("summary layout", () => {
  for (const [w, h] of [[1920, 1080], [1440, 900], [1366, 650], [1280, 720], [1000, 600], [860, 600], [768, 1024], [412, 780], [390, 664], [360, 640]] as const) {
    test(`fits at ${w}x${h}`, async ({ page, isMobile }) => {
      test.skip(isMobile, "viewport set by hand");
      await page.setViewportSize({ width: w, height: h });
      // Phones try both teams, whose titles differ in length.
      for (const [lang, theme, club] of [["en", "night", "MIL"], ["en", "day", "MIL"], ["es", "night", "MIL"], ["es", "day", "MIL"], ...(w <= 412 ? [["en", "night", "TB"], ["es", "day", "TB"]] : [])]) {
        {
          await page.goto(`/?lang=${lang}&theme=${theme}#/g/849799/${club}/summary`);
          await expect(summary(page)).toHaveAttribute("data-on", "true");
          await page.waitForTimeout(1800);
          const bad = await page.evaluate(() => {
            const out: string[] = [];
            const s = document.querySelector(".summary")!;
            if (s.scrollHeight - s.clientHeight > 1) out.push(`overflow ${s.scrollHeight - s.clientHeight}`);
            const bar = document.querySelector(".bar")!.getBoundingClientRect().bottom;
            for (const e of s.querySelectorAll(".sum-title, .sum-card, .sum-foot, .sum-link, .seg-label, .cmp-label, .sum-good")) {
              const r = e.getBoundingClientRect();
              if (r.width === 0) continue;
              if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < bar - 0.5 || r.bottom > innerHeight + 0.5) out.push(`${e.className} outside`);
            }
            for (const e of s.querySelectorAll(".sum-card *")) {
              const t = e as HTMLElement;
              if (t.children.length === 0 && t.textContent && t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).overflow !== "visible") out.push(`${t.className} cut`);
            }
            const labels = [...s.querySelectorAll(".seg-label")].map((l) => [...l.children].map((c) => c.getBoundingClientRect()));
            for (let i = 1; i < labels.length; i++) {
              for (const a of labels[i - 1]) for (const b of labels[i]) if (a.right > b.left + 0.5 && a.bottom > b.top && b.bottom > a.top) out.push(`run labels ${i - 1} and ${i} overlap`);
            }
            const ball = s.querySelector(".fly-ball")!.getBoundingClientRect();
            const title = s.querySelector(".sum-title")!;
            const range = document.createRange();
            range.selectNodeContents(title);
            const text = range.getBoundingClientRect();
            if (ball.right > text.left + 0.5 && ball.bottom > text.top && text.bottom > ball.top) out.push("ball covers the title");
            return [...new Set(out)];
          });
          expect(bad, `${lang} ${theme} ${club}`).toEqual([]);
        }
      }
    });
  }

  for (const theme of ["night", "day"]) {
    test(`has no serious accessibility problems (${theme})`, async ({ page }) => {
      await page.goto(`/?lang=en&theme=${theme}#/g/849799/TB/summary`);
      await page.waitForTimeout(2500);
      const { violations } = await new AxeBuilder({ page }).include(".summary").withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
    });
  }
});
