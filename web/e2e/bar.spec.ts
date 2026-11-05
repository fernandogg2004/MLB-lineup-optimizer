import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { pick, stubLogos } from "./helpers";

const game = (page: Page) => page.getByRole("combobox", { name: "Game", exact: true });
const team = (page: Page) => page.getByRole("combobox", { name: "Team", exact: true });
const screenNow = (page: Page) =>
  page.evaluate(() => {
    const s = document.querySelector<HTMLElement>(".scroller");
    return (s?.scrollTop ?? 0) / (s?.querySelector<HTMLElement>(".screen")?.offsetHeight ?? 1);
  });
const ready = (page: Page) => expect(page.locator(".rail button[aria-current], .ors[data-on]").first()).toBeAttached();

test.beforeEach(({ page }) => stubLogos(page));

test.describe("top bar", () => {
  test("is the same navy in night and day, with a white menu icon", async ({ page }) => {
    const looks: string[] = [];
    for (const theme of ["night", "day"]) {
      await page.goto(`/?lang=en&theme=${theme}`);
      await expect(game(page)).toBeVisible();
      const look = await page.evaluate(() => {
        const bar = getComputedStyle(document.querySelector(".bar")!);
        const icon = getComputedStyle(document.querySelector(".bar .burger")!);
        return `${bar.backgroundImage} ${icon.color}`;
      });
      expect(look).toContain("rgb(255, 255, 255)");
      looks.push(look);
    }
    expect(looks[0]).toBe(looks[1]);
  });

  test("puts the title and a baseball seam after the menu icon on wide screens", async ({ page, isMobile }) => {
    test.skip(isMobile, "the title has no room on a phone");
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/?lang=en");
    await expect(page.locator(".bar .brand")).toHaveText("Batting Order Lab");
    await expect(page.locator(".bar-mark .seam-stitch")).toHaveCount(5);
    await expect(page.locator(".bar .brand")).toHaveCSS("font-size", "20.8px");
    const order = await page.evaluate(() =>
      [".burger", ".brand", ".bar-mark", ".pickers"].map((s) => document.querySelector(`.bar ${s}`)!.getBoundingClientRect().x),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await expect(page.locator(".bar-mark .seam-stitch").first()).toHaveCSS("stroke", "rgb(232, 80, 63)");
  });

  for (const lang of ["en", "es"]) {
    test(`selectors and open lists fit every width (${lang})`, async ({ page }) => {
      for (const width of [320, 360, 390, 400, 401, 600, 601, 761, 861, 1024, 1101, 1440]) {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`/?lang=${lang}`);
        for (const box of await page.getByRole("combobox").all()) {
          const b = (await box.boundingBox())!;
          expect(b.x, `button ${width}`).toBeGreaterThanOrEqual(0);
          expect(b.x + b.width, `button ${width}`).toBeLessThanOrEqual(width);
          expect(b.y + b.height, `button ${width}`).toBeLessThanOrEqual(60);
          const cut = await box.locator(".picker-face .picker-text:visible").evaluate((t) => t.scrollWidth > t.clientWidth);
          expect(cut, `shown text ${width}`).toBe(false);
          await box.click();
          const list = page.locator(".picker-list:visible");
          const l = (await list.boundingBox())!;
          expect(l.x, `list ${width}`).toBeGreaterThanOrEqual(0);
          expect(l.x + l.width, `list ${width}`).toBeLessThanOrEqual(width);
          const clipped = await list.locator(".picker-text").evaluateAll((all) => all.some((t) => t.scrollWidth > t.clientWidth));
          expect(clipped, `option text ${width}`).toBe(false);
          await box.click();
        }
      }
    });
  }
});

test.describe("selector size", () => {
  const widths = async (page: Page) => [(await game(page).boundingBox())!.width, (await team(page).boundingBox())!.width];

  test("both are one width with a clear gap, whatever they show, with shorter content centred", async ({ page, isMobile }) => {
    test.skip(isMobile, "a phone gives the match the larger share");
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?lang=en#/g/849799/MIL/1");
      await ready(page);
      const [g, tm] = await widths(page);
      expect(Math.abs(g - tm)).toBeLessThanOrEqual(1);
      const gap = (await team(page).boundingBox())!.x - ((await game(page).boundingBox())!.x + g);
      expect(gap).toBeGreaterThanOrEqual(30);
      for (const box of [game(page), team(page)]) {
        const centred = await box.evaluate((b) => {
          const face = b.querySelector(".picker-face")!;
          const parts = [...face.children].filter((c) => getComputedStyle(c).display !== "none").map((c) => c.getBoundingClientRect());
          const r = b.getBoundingClientRect();
          return Math.abs((parts[0].left + parts[parts.length - 1].right) / 2 - (r.left + r.width / 2));
        });
        expect(centred, `centred ${width}`).toBeLessThanOrEqual(1);
      }
      await pick(page, "Team", "TB");
      await expect(team(page)).toHaveAttribute("data-value", "TB");
      await pick(page, "Game", "849804");
      await expect(game(page)).toHaveAttribute("data-value", "849804");
      expect(await widths(page)).toEqual([g, tm]);
    }
  });

  test("keep their width when the choice changes on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/?lang=en#/g/849799/MIL/1");
    await ready(page);
    const before = await widths(page);
    await pick(page, "Team", "TB");
    await expect(team(page)).toHaveAttribute("data-value", "TB");
    await pick(page, "Game", "849804");
    await expect(game(page)).toHaveAttribute("data-value", "849804");
    expect(await widths(page)).toEqual(before);
  });
});

test.describe("match selector", () => {
  test("lists the games in the bar's colours with a gold ball for the World Series, and changes game", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/TB/4");
    await ready(page);
    await expect(game(page)).toHaveAttribute("data-value", "849799");
    await expect(game(page).locator(".ball-gold")).toBeVisible();
    await game(page).click();
    const list = page.locator(".picker-game .picker-list");
    await expect(list).toBeVisible();
    await expect(list).toHaveCSS("background-color", "rgb(10, 31, 64)");
    await expect(list.getByRole("option")).toHaveCount(5);
    await expect(list.locator(".ball-gold")).toHaveCount(5);
    await expect(list.getByRole("option", { selected: true })).toContainText("Game 5");
    await list.locator('[data-value="849802"]').click();
    await expect(page).toHaveURL(/#\/g\/849802\/TB\/1$/);
    await expect(game(page)).toHaveAttribute("data-value", "849802");
  });

  test("gives other games a white ball", async ({ page }) => {
    await page.route("**/data/index.json", async (route) => {
      const res = await route.fetch();
      const index = await res.json();
      index.games[1].game_type = "R";
      index.games[1].series_description = "Regular Season";
      index.games[1].series_game_number = null;
      await route.fulfill({ response: res, json: index });
    });
    await page.goto("/?lang=en");
    await game(page).click();
    const options = page.locator(".picker-game .picker-option");
    await expect(options.nth(0).locator(".ball-gold")).toBeVisible();
    await expect(options.nth(1).locator(".ball-white")).toBeVisible();
    await expect(page.locator(".picker-game .ball-white .ball-skin").first()).toHaveCSS("fill", "rgb(255, 255, 255)");
  });
});

test.describe("team selector", () => {
  test("shows MLB's logo for each club and changes team", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/3");
    await ready(page);
    await expect(team(page).locator("img")).toHaveAttribute("src", "https://www.mlbstatic.com/team-logos/team-cap-on-dark/158.svg");
    await team(page).click();
    const list = page.locator(".picker-team .picker-list");
    await expect(list.getByRole("option", { name: "Milwaukee Brewers", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(list.getByRole("option", { name: "Tampa Bay Rays", exact: true }).locator("img")).toHaveAttribute("src", /\/139\.svg$/);
    await expect(list.locator("img")).toHaveCount(2);
    await list.getByRole("option", { name: "Tampa Bay Rays", exact: true }).click();
    await expect(page).toHaveURL(/#\/g\/849799\/TB\/1$/);
    await expect(page.locator('.screen[data-screen="0"] .who')).toHaveText("1st. Liam Hicks");
  });

  test("falls back to a team-colour badge when a logo cannot load", async ({ page }) => {
    await page.route("https://www.mlbstatic.com/**", (r) => r.abort());
    await page.goto("/?lang=en#/g/849799/MIL/1");
    await expect(team(page).locator(".team-badge")).toHaveText("MIL");
    await expect(team(page).locator(".team-badge")).toHaveCSS("background-color", "rgb(18, 40, 75)");
    await expect(team(page).locator("img")).toHaveCount(0);
  });

  test("the published security policy allows the logos and nothing else new", async ({ page }) => {
    const config = JSON.parse(readFileSync("vercel.json", "utf8")) as { headers: { headers: { key: string; value: string }[] }[] };
    const csp = config.headers.flatMap((h) => h.headers).find((h) => h.key === "Content-Security-Policy")!.value;
    expect(csp).toContain("img-src 'self' data: https://www.mlbstatic.com;");
    expect(csp).toContain("connect-src 'self';");
    await page.route(/\/\?lang=en$/, async (route) => {
      const res = await route.fetch();
      await route.fulfill({ response: res, headers: { ...res.headers(), "content-security-policy": csp } });
    });
    await page.goto("/?lang=en");
    const logo = team(page).locator("img");
    await expect(logo).toBeVisible();
    await expect.poll(() => logo.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
  });
});

test.describe("selector behaviour", () => {
  test("works by keyboard without moving the batter", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/3");
    await ready(page);
    await team(page).focus();
    await page.keyboard.press("ArrowDown");
    await expect(team(page)).toHaveAttribute("aria-expanded", "true");
    await page.keyboard.press("ArrowDown");
    await expect(page.locator(".picker-team .picker-option").nth(1)).toHaveAttribute("data-active", "true");
    await expect(team(page)).toHaveAttribute("aria-activedescendant", /.+/);
    await page.keyboard.press("Escape");
    await expect(team(page)).toHaveAttribute("aria-expanded", "false");
    await expect(team(page)).toBeFocused();
    await page.keyboard.press("PageDown");
    await page.waitForTimeout(150);
    expect(await screenNow(page)).toBe(2);
    await expect(team(page)).toHaveAttribute("data-value", "MIL");

    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#\/g\/849799\/TB\/1$/);
    await expect(team(page)).toBeFocused();
  });

  test("typing a name finds it", async ({ page }) => {
    await page.goto("/?lang=en#/g/849799/MIL/1");
    await team(page).focus();
    await page.keyboard.type("tam");
    await expect(page.locator(".picker-team .picker-option").nth(1)).toHaveAttribute("data-active", "true");
    await page.keyboard.press("Enter");
    await expect(team(page)).toHaveAttribute("data-value", "TB");
  });

  test("clicking elsewhere closes the list and only one list is open", async ({ page }) => {
    await page.goto("/?lang=en");
    await game(page).click();
    await team(page).click();
    await expect(page.locator(".picker-list:visible")).toHaveCount(1);
    await page.mouse.click(200, 400);
    await expect(page.locator(".picker-list:visible")).toHaveCount(0);
  });

  test("scrolling over an open list leaves the batter alone; scrolling the page closes it", async ({ page, isMobile }) => {
    test.skip(isMobile, "a phone has no wheel");
    await page.goto("/?lang=en#/g/849799/MIL/3");
    await ready(page);
    await game(page).click();
    await page.locator(".picker-game .picker-list").hover();
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(300);
    expect(await screenNow(page)).toBe(2);
    await expect(page.locator(".picker-game .picker-list")).toBeVisible();
    await page.mouse.move(300, 500);
    await page.mouse.wheel(0, 100);
    await expect(page.locator(".picker-list:visible")).toHaveCount(0);
  });

  test("works on Statistics too", async ({ page }) => {
    await page.goto("/?lang=en#/statistics");
    await pick(page, "Team", "TB");
    await expect(page.getByText("Ben Williamson").first()).toBeVisible();
    await expect(team(page)).toHaveAttribute("data-value", "TB");
  });

  for (const theme of ["night", "day"]) {
    test(`has no accessibility problems with a list open (${theme})`, async ({ page }) => {
      await page.goto(`/?lang=en&theme=${theme}`);
      await ready(page);
      for (const box of [game(page), team(page)]) {
        await box.click();
        const { violations } = await new AxeBuilder({ page }).include(".bar").analyze();
        expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(", ")}`)).toEqual([]);
        await box.click();
      }
    });
  }
});

test.describe("Starting pitcher and Bullpen labels", () => {
  test("sit above their button, centred on it, and in front of the rings", async ({ page, isMobile }) => {
    test.skip(isMobile, "a phone centres the label on the whole selector");
    for (const width of [1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/?lang=en");
      await ready(page);
      const first = page.locator('.screen[data-screen="0"]');
      for (const i of [0, 1]) {
        const label = first.locator(".vs label").nth(i);
        await label.hover({ force: true });
        const hint = label.locator(".vs-hint");
        await expect(hint).toBeVisible();
        await page.waitForTimeout(220);
        const h = (await hint.boundingBox())!;
        const b = (await label.boundingBox())!;
        expect(h.y + h.height).toBeLessThanOrEqual(b.y);
        expect(Math.abs(h.x + h.width / 2 - (b.x + b.width / 2))).toBeLessThanOrEqual(1);
        expect(h.height, "one line").toBeLessThan(32);
        await expect(first.locator(".outcome")).toHaveCSS("z-index", "3");
      }
    }
  });

  test("stay on screen and above the selector on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 664 });
    for (const lang of ["en", "es"]) {
      await page.goto(`/?lang=${lang}`);
      await ready(page);
      const first = page.locator('.screen[data-screen="0"]');
      const vs = (await first.locator(".vs").boundingBox())!;
      for (const i of [0, 1]) {
        await first.locator(".vs label").nth(i).hover({ force: true });
        const hint = first.locator(".vs-hint").nth(i);
        await expect(hint).toBeVisible();
        await page.waitForTimeout(220);
        const h = (await hint.boundingBox())!;
        expect(h.x).toBeGreaterThanOrEqual(0);
        expect(h.x + h.width).toBeLessThanOrEqual(390);
        expect(h.y + h.height).toBeLessThanOrEqual(vs.y);
      }
    }
  });
});
