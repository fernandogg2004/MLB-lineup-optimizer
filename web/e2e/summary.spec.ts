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
  await expect(page.locator(".screen")).toHaveCount(10);
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
    await expect(s.locator("h2")).toHaveText("This lineup is a modest upgrade");
    await expect(s.locator(".sum-sub")).toHaveCount(0);
    const runs = s.locator(".sum-runs");
    await expect(runs.locator(".sum-label")).toHaveText("Expected runs");
    await expect(runs.locator(".sum-number")).toHaveText("3.36", { timeout: 5000 });
    await expect(runs.locator(".sum-good")).toHaveText("Best of362,880batting orders");
    await expect(runs.locator(".sum-mark, .mark-seam")).toHaveCount(0);
    const beats = s.locator(".sum-beats");
    await expect(beats.locator(".sum-label")).toHaveText("Beats actual lineup in");
    await expect(beats.locator(".sum-number")).toHaveText("100/100", { timeout: 5000 });
    await expect(beats.locator(".sum-label-after")).toHaveText("simulations");
    await expect(beats.locator(".icon-gold")).toHaveCSS("color", "rgb(244, 185, 35)");
    await expect(s.locator(".sum-compare figcaption")).toHaveText("Comparison of expected runs");
    await expect(s.locator(".cmp-label")).toHaveText(["Optimized lineup", "Actual lineup"]);
    await expect(s.locator(".cmp-value")).toHaveText(["3.36", "3.34"]);
    await expect(s.locator(".cmp-diff")).toHaveText("+0.02runs per game");
    await expect(s.locator(".cmp-gain")).toHaveCSS("color", "rgb(126, 226, 160)");
    await expect(s.locator(".cmp-diff")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(s.locator(".cmp-gain .rise")).toBeVisible();
    await expect(s.locator(".sum-dist figcaption")).toHaveText("Probability of scoring n runs");
    await expect(s.locator(".dist-run")).toHaveText(["0", "1", "2", "3", "4", "5+"]);
    await expect(s.locator(".dist-pct")).toHaveText(["11%", "16%", "17%", "15%", "13%", "28%"], { timeout: 5000 });
    await expect(s.locator(".dist")).toHaveAttribute("aria-label", "Chance of each number of runs: 0 runs: 11%, 1 runs: 16%, 2 runs: 17%, 3 runs: 15%, 4 runs: 13%, 5+ runs: 28%.");
    await expect(s.locator(".sum-foot")).toHaveText("All numbers above are model estimates.");
    await expect(s.locator(".sum-link")).toHaveText("See the full analysis");
    const foot = await s.locator(".sum-foot").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    const link = await s.locator(".sum-link").evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
    expect(link).toBeLessThan(foot);
  });

  test("the batter moved furthest sits beside the count on wide screens", async ({ page, isMobile }) => {
    test.skip(isMobile, "phones have no room for it");
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/?lang=en#/g/849799/MIL/summary");
    const move = summary(page).locator(".sum-move");
    await expect(move).toBeVisible();
    await expect(move.locator(".sum-move-head")).toHaveText("Biggest change");
    await expect(move.locator(".sum-move-name")).toHaveText("Brice Turang");
    await expect(move.locator(".sum-move-slots")).toHaveText("5th → moves to 1st");
  });

  test("Milwaukee: a smaller gain and a whole number of simulations", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/summary");
    await expect(summary(page).locator("h2")).toHaveText("This lineup is a small upgrade");
    await expect(summary(page).locator(".sum-beats .sum-number")).toHaveText("91/100", { timeout: 5000 });
    await expect(summary(page).locator(".cmp-gain strong")).toHaveText("+0.01");
  });

  test("Spanish, with its own number format", async ({ page }) => {
    await page.goto("/?lang=es#/g/849799/MIL/summary");
    const s = summary(page);
    await expect(s.locator("h2")).toHaveText("Esta alineación es una mejora pequeña");
    await expect(s.locator(".sum-runs .sum-number")).toHaveText("3,84", { timeout: 5000 });
    await expect(s.locator(".sum-good").first()).toHaveText("La mejor de362.880órdenes al bate");
    await expect(s.locator(".sum-beats .sum-label-after")).toHaveText("simulaciones");
    await expect(s.locator(".dist-pct").first()).toHaveText("8 %", { timeout: 5000 });
    await expect(s.locator(".sum-foot")).toHaveText("Todas las cifras anteriores son estimaciones del modelo.");
  });

  test("each run group uses the pie's colours, and the groups total 100", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/TB/summary");
    await expect(page.locator(".dist-bar")).toHaveCount(6);
    const bars = await page.locator(".dist-bar").evaluateAll((all) => all.map((p) => getComputedStyle(p).backgroundColor));
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
    expect(bars).toEqual(pie);
    // The percentages roll before they land, so wait for all of them to settle.
    await expect.poll(async () => (await page.locator(".dist-pct").allTextContents()).map((p) => Number(p.replace("%", ""))).reduce((a, b) => a + b, 0), { timeout: 6000 }).toBe(100);
    // Heights follow the chances: the tallest bar is the most likely group.
    await expect.poll(() => page.locator(".dist-bar").evaluateAll((all) => all.map((b) => Math.round(b.getBoundingClientRect().height))), { timeout: 4000 })
      .toEqual(expect.arrayContaining([expect.any(Number)]));
    const heights = await page.locator(".dist-bar").evaluateAll((all) => all.map((b) => b.getBoundingClientRect().height));
    expect(heights.indexOf(Math.max(...heights))).toBe(5);
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
    // The run columns grow; the tallest reaches the top of its plot.
    const tallest = page.locator(".dist-col").last();
    await expect.poll(() => tallest.locator(".dist-bar").evaluate((e) => e.getBoundingClientRect().height), { timeout: 4000 })
      .toBeGreaterThan(await tallest.locator(".dist-plot").evaluate((e) => e.getBoundingClientRect().height - 26));
    // The ball stops in mid-air and stays there, with its speed lines clear of it.
    await expect(page.locator(".fly")).toHaveClass(/fly-on/);
    await expect.poll(() => page.locator(".fly").evaluate((e) => e.getAnimations({ subtree: true }).every((a) => a.playState === "finished"))).toBe(true);
    const touching = await page.evaluate(() => {
      // The ball's circle against each line's two ends, which sit along the turned path.
      const r = document.querySelector(".fly-ball svg")!.getBoundingClientRect();
      const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
      const radius = (r.width / 2) * (10.5 / 12);
      return [...document.querySelectorAll(".fly-lines i")].some((l) => {
        const b = l.getBoundingClientRect();
        const near = { x: Math.max(b.left, Math.min(c.x, b.right)), y: Math.max(b.top, Math.min(c.y, b.bottom)) };
        return Math.hypot(near.x - c.x, near.y - c.y) < radius + 3;
      });
    });
    expect(touching).toBe(false);
    // The lines are already there while the ball is still flying (checked in the next test's samples).
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

  test("the ball's path is a parabola that tops out where it stops", async ({ page, isMobile }) => {
    test.skip(isMobile, "the same code; one project is enough");
    await page.goto("/?lang=en#/g/849799/TB/1");
    await toSummary(page);
    const path: { x: number; y: number; lines: number }[] = [];
    for (let k = 0; k < 18; k++) {
      path.push(
        await page.locator(".fly-ball").evaluate((e) => {
          const r = e.getBoundingClientRect();
          const lines = Number(getComputedStyle(document.querySelector(".fly-lines i")!).opacity);
          return { x: r.x + r.width / 2, y: r.y + r.height / 2, lines };
        }),
      );
      await page.waitForTimeout(50);
    }
    // Only the samples taken in flight.
    const flight = path.filter((p, k) => k > 0 && p.x > path[k - 1].x + 0.5);
    expect(flight.length).toBeGreaterThanOrEqual(6);
    // Moving right and rising throughout, never dipping: the top of the arc is where it stops.
    for (let k = 1; k < flight.length; k++) expect(flight[k].y).toBeLessThanOrEqual(flight[k - 1].y + 0.5);
    // Its climb flattens out: a curve, not a straight line.
    const slope = (a: { x: number; y: number }, b: { x: number; y: number }) => (a.y - b.y) / (b.x - a.x);
    expect(slope(flight[0], flight[2])).toBeGreaterThan(slope(flight.at(-3)!, flight.at(-1)!) * 1.15);
    // It stops while still climbing: a diagonal, not a flat flight.
    expect(slope(flight.at(-3)!, flight.at(-1)!)).toBeGreaterThan(0.35);
    // The speed lines are part of the throw: visible while the ball is still on its way.
    // They fade in over the first quarter second, so they are showing from the first sample in flight and
    // fully there from mid-flight on.
    expect(flight[0].lines).toBeGreaterThan(0);
    expect(flight.slice(Math.floor(flight.length / 2), -1).every((p) => p.lines > 0.9)).toBe(true);
  });

  test("the count out of 100 never shows more than 100 on the way", async ({ page, isMobile }) => {
    test.skip(isMobile, "the same code; one project is enough");
    await page.goto("/?lang=en#/g/849799/TB/1");
    await toSummary(page);
    const seen: number[] = [];
    for (let k = 0; k < 25; k++) {
      seen.push(Number((await page.locator(".sum-beats .sum-number").innerText()).split("/")[0]));
      await page.waitForTimeout(50);
    }
    expect(Math.max(...seen)).toBeLessThanOrEqual(100);
    expect(seen.at(-1)).toBe(100);
  });

  test("reduced motion shows everything at once", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?lang=en#/g/849799/TB/summary");
    await expect(summary(page).locator(".sum-runs .sum-number")).toHaveText("3.36");
    const track = await page.locator(".cmp-opt .cmp-track").evaluate((e) => e.getBoundingClientRect().width);
    expect(await page.locator(".cmp-opt .cmp-fill").evaluate((e) => e.getBoundingClientRect().width)).toBeGreaterThan(track - 4);
    expect(await page.locator(".fly").evaluate((e) => e.getAnimations({ subtree: true }).length)).toBe(0);
    await expect(summary(page).locator(".sum-beats .sum-number")).toHaveText("100/100");
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
            for (const e of s.querySelectorAll(".sum-title, .sum-card, .sum-foot, .sum-link, .dist-pct, .dist-run, .cmp-label, .sum-good, .sum-move")) {
              const r = e.getBoundingClientRect();
              if (r.width === 0) continue;
              if (r.left < -0.5 || r.right > innerWidth + 0.5 || r.top < bar - 0.5 || r.bottom > innerHeight + 0.5) out.push(`${e.className} outside`);
            }
            for (const e of s.querySelectorAll(".sum-card *")) {
              const t = e as HTMLElement;
              if (t.children.length === 0 && t.textContent && !t.classList.contains("sr-only") && t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).overflow !== "visible") out.push(`${t.className} cut`);
            }
            const pcts = [...s.querySelectorAll(".dist-pct")].map((l) => l.getBoundingClientRect());
            for (let i = 1; i < pcts.length; i++) if (pcts[i - 1].right > pcts[i].left + 0.5 && pcts[i - 1].bottom > pcts[i].top && pcts[i].bottom > pcts[i - 1].top) out.push(`run percentages ${i - 1} and ${i} overlap`);
            const cardTitle = s.querySelector(".sum-dist .sum-card-title")!.getBoundingClientRect();
            for (const p of pcts) if (p.top < cardTitle.bottom) out.push("a percentage reaches the card title");
            const ball = s.querySelector(".fly-ball")!.getBoundingClientRect();
            const title = s.querySelector(".sum-title")!;
            const range = document.createRange();
            const words = [...title.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
            range.setStartBefore(words[0]);
            range.setEndAfter(words.at(-1)!);
            const text = range.getBoundingClientRect();
            if (ball.right > text.left + 0.5 && ball.bottom > text.top && text.bottom > ball.top) out.push("ball covers the title");
            for (const card of s.querySelectorAll(".sum-card")) {
              const c = card.getBoundingClientRect();
              if (ball.right > c.left + 0.5 && c.right > ball.left + 0.5 && ball.bottom > c.top + 0.5 && c.bottom > ball.top + 0.5) out.push("ball covers a card");
            }
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
