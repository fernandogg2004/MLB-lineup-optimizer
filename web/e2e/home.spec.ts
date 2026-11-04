import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  (page as unknown as { _errors: string[] })._errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as unknown as { _errors: string[] })._errors).toEqual([]);
});

const position = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector<HTMLElement>(".scroller");
    const h = s?.querySelector<HTMLElement>(".screen")?.offsetHeight ?? 1;
    return (s?.scrollTop ?? 0) / h;
  });

async function toScreen(page: Page, i: number, settle = 350) {
  await page.evaluate((i) => {
    const s = document.querySelector<HTMLElement>(".scroller");
    const h = s?.querySelector<HTMLElement>(".screen")?.offsetHeight ?? 1;
    s?.scrollTo({ top: i * h, behavior: "instant" });
  }, i);
  await page.waitForTimeout(settle);
}

const settled = (page: Page) => page.waitForTimeout(1300);
const ready = (page: Page) => expect(page.locator(".screen")).toHaveCount(10);

test.describe("front page", () => {
  test("opens on the model's first batter with rings and pie", async ({ page }) => {
    await page.goto("/?lang=en");
    const first = page.locator('.screen[data-screen="0"]');
    await expect(first.getByRole("heading", { level: 2 })).toHaveText("1st. Brice Turang");
    await expect(first.getByText("2B · Batted 5th in the real lineup")).toBeVisible();
    await expect(first.getByText("The model's best order for Milwaukee Brewers · 1 of 9")).toBeVisible();
    for (const [stat, value, note] of [["AVG", ".268", "78th percentile"], ["OBP", ".366", "93rd percentile"], ["SLG", ".450", "77th percentile"], ["OPS", ".816", "84th percentile"]]) {
      const ring = first.getByRole("meter", { name: stat });
      await expect(ring).toHaveAttribute("aria-valuetext", new RegExp(`^${value.replace(".", "\\.")}, ${note}`));
    }
    await expect(first.locator(".ors__note")).toHaveText(["78th percentile", "93rd percentile", "77th percentile", "84th percentile"]);
    // Numbers settle on the true value at the lock.
    await expect(first.locator(".ors").first()).toHaveAttribute("data-on", "true");
    await expect(first.getByRole("meter", { name: "OPS" })).toHaveAttribute("aria-valuenow", "84");
    await expect(page).not.toHaveURL(/#\/g\//);
  });

  test("pie switches between the starter and the bullpen, and the choice persists", async ({ page }) => {
    await page.goto("/?lang=en");
    const first = page.locator('.screen[data-screen="0"]');
    const walks = first.getByRole("row", { name: /Walk or hit by pitch/ });
    await expect(walks).toContainText("8%");
    await first.getByLabel("Bullpen").check();
    await expect(walks).toContainText("12%");
    await toScreen(page, 1);
    await expect(page.locator('.screen[data-screen="1"]').getByLabel("Bullpen")).toBeChecked();
  });

  test("hovering a slice lights it up and emphasises its label", async ({ page, isMobile }) => {
    test.skip(isMobile, "pointer hover");
    await page.goto("/?lang=en");
    const slice = page.locator('.screen[data-screen="0"] .slice').nth(4);
    await slice.hover();
    await expect(slice).toHaveClass(/on/);
    await expect(page.locator('.screen[data-screen="0"] .pie-label.on')).toContainText("Strikeout");
  });

  test("a ring explains itself on keyboard focus", async ({ page }) => {
    await page.goto("/?lang=en");
    const first = page.locator('.screen[data-screen="0"]');
    await first.getByRole("meter", { name: "OBP" }).focus();
    await expect(first.locator(".ors__hint").nth(1)).toBeVisible();
    await expect(first.locator(".ors__hint").nth(1)).toHaveText("On-base percentage: better than 93% of hitters");
  });
});

test.describe("the lock", () => {
  test("a wheel gesture moves exactly one screen, whatever its size", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel");
    await page.goto("/?lang=en");
    await ready(page);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 3000);
    await settled(page);
    expect(await position(page)).toBe(1);
    await page.mouse.wheel(0, 100);
    await settled(page);
    expect(await position(page)).toBe(2);
    for (let i = 0; i < 25; i++) {
      await page.mouse.wheel(0, 120);
      await page.waitForTimeout(30);
    }
    await settled(page);
    expect(await position(page)).toBe(3);
    await page.mouse.wheel(0, -100);
    await settled(page);
    expect(await position(page)).toBe(2);
  });

  test("the end of the page holds", async ({ page, isMobile }) => {
    test.skip(isMobile, "wheel");
    await page.goto("/?lang=en#/g/849799/MIL/summary");
    await ready(page);
    expect(await position(page)).toBe(9);
    await page.mouse.move(700, 450);
    await page.mouse.wheel(0, 500);
    await settled(page);
    expect(await position(page)).toBe(9);
  });

  test("keyboard moves one screen at a time", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard");
    await page.goto("/?lang=en");
    await ready(page);
    await page.keyboard.press("PageDown");
    await settled(page);
    expect(await position(page)).toBe(1);
    await page.keyboard.press("ArrowDown");
    await settled(page);
    expect(await position(page)).toBe(2);
    await page.keyboard.press("ArrowUp");
    await settled(page);
    expect(await position(page)).toBe(1);
    await page.keyboard.press("End");
    await settled(page);
    expect(await position(page)).toBe(9);
    await page.keyboard.press("Home");
    await settled(page);
    expect(await position(page)).toBe(0);
  });

  test("a touch flick moves exactly one screen", async ({ page, isMobile, context }) => {
    test.skip(!isMobile, "touch");
    await page.goto("/?lang=en");
    await ready(page);
    const cdp = await context.newCDPSession(page);
    const flick = async () => {
      const x = 195;
      const y0 = 620;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
      for (let i = 1; i <= 4; i++) {
        await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y0 - i * 150 }] });
        await page.waitForTimeout(8);
      }
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForTimeout(1500);
    };
    await flick();
    expect(await position(page)).toBe(1);
    await flick();
    expect(await position(page)).toBe(2);
  });

  test("rings reveal only on the locked screen", async ({ page }) => {
    await page.goto("/?lang=en");
    await ready(page);
    await expect(page.locator(".ors[data-on]")).toHaveCount(1);
    await toScreen(page, 2);
    await expect(page.locator(".ors[data-on]")).toHaveCount(1);
    await expect(page.locator('.screen[data-screen="2"] .ors')).toHaveAttribute("data-on", "true");
  });
});

test.describe("layout on each screen", () => {
  test("picture sides alternate, and the batter faces the statistics under a centred name", async ({ page, isMobile }) => {
    test.skip(isMobile, "side-by-side layout");
    await page.goto("/?lang=en");
    await ready(page);
    for (let i = 0; i < 9; i++) {
      await toScreen(page, i);
      const r = await page.evaluate((i) => {
        const s = document.querySelector(`.screen[data-screen="${i}"]`);
        const pic = s?.querySelector(".pic")?.getBoundingClientRect();
        const data = s?.querySelector(".data")?.getBoundingClientRect();
        const fig = s?.querySelector(".figure")?.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(s?.querySelector(".who") as Node);
        const name = range.getBoundingClientRect();
        const rawFlip = s?.querySelector(".bf > g")?.getAttribute("transform");
        return {
          statsOnRight: (data?.left ?? 0) > (pic?.left ?? 0),
          facesRight: rawFlip === null,
          offset: Math.abs((name.left + name.right) / 2 - ((fig?.left ?? 0) + (fig?.right ?? 0)) / 2),
          pieOffset: (() => {
            const a = s?.querySelector(".ors__row")?.getBoundingClientRect();
            const b = s?.querySelector(".pie-wrap")?.getBoundingClientRect();
            return Math.abs(((a?.left ?? 0) + (a?.right ?? 0)) / 2 - ((b?.left ?? 0) + (b?.right ?? 0)) / 2);
          })(),
        };
      }, i);
      expect(r.statsOnRight, `screen ${i}`).toBe(i % 2 === 0);
      expect(r.facesRight, `screen ${i}`).toBe(r.statsOnRight);
      expect(r.offset, `screen ${i}`).toBeLessThanOrEqual(2);
      expect(r.pieOffset, `screen ${i}`).toBeLessThanOrEqual(2);
    }
  });

  test("every pie totals 100 and no percentage shows decimals, in both languages", async ({ page }) => {
    test.setTimeout(120_000);
    for (const lang of ["en", "es"]) {
      await page.goto(`/?lang=${lang}`);
      await ready(page);
      for (let i = 0; i < 10; i++) {
        await toScreen(page, i, 1500);
        const r = await page.evaluate((i) => {
          const s = document.querySelector<HTMLElement>(`.screen[data-screen="${i}"]`);
          const pcts = [...(s?.querySelectorAll(".pie-pct") ?? [])].map((e) => e.textContent ?? "");
          return { pcts, text: s?.textContent ?? "" };
        }, i);
        if (i < 9) {
          expect(r.pcts).toHaveLength(7);
          expect(r.pcts.reduce((a, p) => a + (p.startsWith("<") ? 0 : parseInt(p, 10)), 0)).toBe(100);
        }
        expect(r.text, `screen ${i}`).not.toMatch(/\d[.,]\d+\s*%/);
        expect(r.text, `screen ${i}`).not.toMatch(/\d\s*%\s*(better|mejor)/i);
      }
    }
  });

  test("the summary lands on the true values and uses expected runs only", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/summary");
    const list = page.locator(".sum-list");
    await expect(list.locator("li").nth(0).locator("span").last()).toHaveText("expects 3.84 runs this game.", { timeout: 5000 });
    await expect(list.locator("li").nth(1).locator("span").last()).toHaveText("moves Brice Turang up from 5th to 1st, its biggest change.");
    await expect(list.locator("li").nth(2).locator("span").last()).toHaveText("sends its first hitter to the plate 4.6 times and its ninth 3.7 times.");
    await expect(list.locator("li").nth(3).locator("span").last()).toHaveText("adds +0.01 runs a game, about 2 over 162 games.");
    await expect(list.locator("li").nth(4).locator("span").last()).toHaveText("beats the real lineup in 91 of 100 model re-runs, so the model is not certain of the gain.");
    await expect(list.locator("li").nth(5).locator("span").last()).toHaveText("scores at least once in 92% of games, and five or more in 35%.");
    await expect(page.locator(".sum-context")).toHaveText("The real order was already better than 98% of the 362,880 possible orders. The best and worst of them are only 0.05 runs apart.");
    await expect(page.locator(".sum-foot")).toContainText("Final score: MIL 4–1 TB.");
  });

  test("Spanish uses its own number format", async ({ page }) => {
    await page.goto("/?lang=es#/g/849799/TB/summary");
    await expect(page.locator(".sum-list li").nth(0).locator("span").last()).toHaveText("espera 3,36 carreras en este partido.", { timeout: 5000 });
    await expect(page.locator(".sum-context")).toContainText("362.880");
    await expect(page.locator(".sum-list li").nth(4).locator("span").last()).toContainText("más de 99 de 100");
  });
});

test.describe("navigation", () => {
  test("changing team goes back to batter 1 and changes the shirt", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/3");
    await ready(page);
    const shirt = () => page.locator('.screen[data-screen="0"] .bf').evaluate((e) => (e as SVGElement).style.getPropertyValue("--bf-team"));
    expect(await shirt()).toBe("#12284b");
    await page.getByRole("combobox", { name: "Team", exact: true }).selectOption("TB");
    await expect(page.locator('.screen[data-screen="0"] .who')).toHaveText("1st. Liam Hicks");
    expect(await position(page)).toBe(0);
    expect(await shirt()).toBe("#8fbce6");
  });

  test("changing match goes back to batter 1 and keeps the team when it played", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/TB/4");
    await ready(page);
    await page.getByRole("combobox", { name: "Game", exact: true }).selectOption("849802");
    await expect(page).toHaveURL(/#\/g\/849802\/TB\/1$/);
    await expect(page.locator('.screen[data-screen="0"]')).toBeVisible();
    expect(await position(page)).toBe(0);
    await expect(page.getByRole("combobox", { name: "Team", exact: true })).toHaveValue("TB");
  });

  test("deep links open the right screen, and the back button works", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/TB/3");
    await expect(page.locator('.screen[data-screen="2"] .who')).toHaveText("3rd. Junior Caminero");
    expect(await position(page)).toBe(2);
    await toScreen(page, 4);
    await expect(page).toHaveURL(/#\/g\/849799\/TB\/5$/); // shareable, without filling the history
    await page.getByRole("combobox", { name: "Team", exact: true }).selectOption("MIL");
    await expect(page).toHaveURL(/#\/g\/849799\/MIL\/1$/);
    await page.goBack();
    await expect(page.getByRole("combobox", { name: "Team", exact: true })).toHaveValue("TB");
    await expect(page.locator('.screen[data-screen="4"]')).toBeVisible();
    expect(await position(page)).toBe(4);
  });

  test("invalid addresses fall back safely", async ({ page }) => {
    await page.goto("/?lang=en#/g/1/NOPE/99");
    await expect(page.locator('.screen[data-screen="0"] .who')).toHaveText("1st. Brice Turang");
    expect(await position(page)).toBe(0);
  });

  test("the selected game and team carry over to Statistics and back", async ({ page }) => {
    await page.goto("/?lang=en#/g/849802/TB/2");
    await ready(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: "Statistics", exact: true }).click();
    await expect(page).toHaveURL(/#\/statistics\/game\/849802\/TB$/);
    await expect(page.getByText("Historical fact", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await expect(page).toHaveURL(/#\/g\/849802\/TB\/1$/);
    await ready(page);
  });
});

test.describe("menu", () => {
  test("opens, traps focus, moves its glow, and closes with Esc", async ({ page, isMobile }) => {
    await page.goto("/?lang=en");
    await ready(page);
    const open = page.getByRole("button", { name: "Open menu" });
    await open.click();
    const home = page.getByRole("button", { name: "Home", exact: true });
    const stats = page.getByRole("button", { name: "Statistics", exact: true });
    await expect(home).toBeFocused();
    await expect(home).toHaveAttribute("aria-current", "page");
    const glow = page.locator(".menu-glow");
    const y = () => glow.evaluate((e) => (e as HTMLElement).style.transform);
    expect(await y()).toBe("translateY(0px)");
    if (!isMobile) {
      await stats.hover();
      expect(await y()).toBe("translateY(56px)");
      await page.locator(".menu-foot").hover();
      expect(await y()).toBe("translateY(0px)");
    }
    await stats.focus();
    expect(await y()).toBe("translateY(56px)");
    // Everything behind the menu is out of reach.
    await expect(page.locator(".bar").locator("xpath=..")).toHaveAttribute("inert", "");
    await page.keyboard.press("Escape");
    await expect(open).toBeFocused();
    await expect(page.locator(".menu")).not.toHaveClass(/open/);
  });

  test("the language selector does not glow and keeps the visitor's place", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/3");
    await ready(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    const es = page.getByRole("button", { name: "ES", exact: true });
    const glowBefore = await page.locator(".menu-glow").evaluate((e) => (e as HTMLElement).style.transform);
    await es.click();
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    expect(await page.locator(".menu-glow").evaluate((e) => (e as HTMLElement).style.transform)).toBe(glowBefore);
    expect(await es.evaluate((e) => getComputedStyle(e).boxShadow)).toBe("none");
    await page.keyboard.press("Escape");
    expect(await position(page)).toBe(2);
    await expect(page.locator('.screen[data-screen="2"] .kicker')).toContainText("3 de 9");
  });

  test("appearance applies everywhere and survives a reload", async ({ page }) => {
    await page.goto("/?lang=en");
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
    await page.keyboard.press("Escape");
    await expect(page.locator('.screen[data-screen="0"] .ors')).toHaveClass(/ors--paper/);
    await page.reload();
    await ready(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
    await page.goto("/?lang=en#/statistics");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "day");
  });
});

test.describe("resilience", () => {
  test("reduced motion shows final values at once with no parallax", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?lang=en#/g/849799/MIL/summary");
    await expect(page.locator(".sum-list li").first().locator("span").last()).toHaveText("expects 3.84 runs this game.");
    expect(await page.locator(".layer").first().evaluate((e) => (e as HTMLElement).style.transform)).toBe("");
    expect(await page.locator("#stadium").evaluate((e) => (e as HTMLElement).style.getPropertyValue("--d"))).toBe("");
  });

  test("landscape phones use normal scrolling and nothing is out of reach", async ({ page, isMobile }) => {
    test.skip(isMobile, "viewport set by hand");
    await page.setViewportSize({ width: 844, height: 390 });
    await page.goto("/?lang=en");
    await ready(page);
    await expect(page.locator(".scroller")).toHaveClass(/flow/);
    await expect(page.locator(".rail")).toHaveCount(0);
    await expect(page.locator('.screen[data-screen="0"] .ors')).toHaveAttribute("data-on", "true");
    await page.locator(".summary h2").scrollIntoViewIfNeeded();
    await expect(page.locator(".summary h2")).toBeInViewport();
    await expect(page.locator(".sum-list li").first().locator("span").last()).toHaveText("expects 3.84 runs this game.", { timeout: 5000 });
  });

  test("a missing data file shows a clear message", async ({ page }) => {
    await page.route("**/data/home/**", (r) => r.abort());
    const errors = (page as unknown as { _errors: string[] })._errors;
    await page.goto("/?lang=en");
    await expect(page.getByRole("alert")).toHaveText("Could not load the game data.");
    errors.length = 0; // the failed request is the point of this test
  });
});

test.describe("accessibility audit", () => {
  for (const [name, url] of [
    ["first batter", "/?lang=en"],
    ["first batter, Spanish, Day", "/?lang=es&theme=day"],
    ["summary", "/?lang=en#/g/849799/TB/summary"],
    ["statistics", "/?lang=en#/statistics"],
    ["simulator", "/?lang=en#/statistics/simulator"],
    ["method", "/?lang=en#/statistics/method"],
    ["statistics, Day", "/?lang=en&theme=day#/statistics"],
  ] as const) {
    test(`axe finds no serious issues: ${name}`, async ({ page }) => {
      await page.goto(url);
      await page.waitForTimeout(2000);
      const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      const serious = violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => `${v.id}: ${v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" | ")}`);
      expect(serious).toEqual([]);
    });
  }

  test("axe finds no serious issues with the menu open", async ({ page }) => {
    await page.goto("/?lang=en");
    await ready(page);
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.waitForTimeout(500);
    const { violations } = await new AxeBuilder({ page }).include(".menu").withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => v.id)).toEqual([]);
  });
});
