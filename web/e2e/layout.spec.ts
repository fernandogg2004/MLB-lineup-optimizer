import { expect, test, type Page } from "@playwright/test";

// A full audit of the Home page: every screen, in every size, language, appearance and team.
// Includes real phone browser heights, which are much shorter than the phones' screens.

type Finding = string;

const SIZES: [number, number][] = [
  [1920, 1080],
  [1440, 900],
  [1366, 650],
  [1100, 700],
  [768, 1024],
  [412, 780], // Android, address bar showing
  [390, 844],
  [390, 664], // iPhone, Safari's address bar showing
  [360, 640],
];

async function audit(page: Page, screen: number): Promise<Finding[]> {
  return page.evaluate((screen) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scr = document.querySelector(`.screen[data-screen="${screen}"]`);
    if (!scr) return ["screen missing"];
    const bad: string[] = [];
    const sel = ".pie-label,.vs,.ors__dial,.ors__label,.ors__note,.who,.kicker,.pos,.figure,.sum-list li,.sum-context,.sum-foot,.sum-link,h2,.caption,.pie";
    const items = [...scr.querySelectorAll(sel)].map((e) => ({ c: e.getAttribute("class") ?? e.tagName, r: e.getBoundingClientRect() }));
    const top = 40;
    for (const o of items) {
      if (o.r.width === 0) continue;
      if (o.r.left < -0.5 || o.r.right > vw + 0.5 || o.r.bottom > vh + 0.5 || o.r.top < top) {
        bad.push(`${o.c} outside [${Math.round(o.r.left)},${Math.round(o.r.top)},${Math.round(o.r.right)},${Math.round(o.r.bottom)}]`);
      }
    }
    const hit = (a: DOMRect, b: DOMRect) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    const labels = items.filter((o) => o.c.startsWith("pie-label"));
    const others = items.filter((o) => ["vs", "ors__note", "caption", "kicker", "pos", "who"].includes(o.c));
    labels.forEach((a, i) => {
      labels.forEach((b, j) => {
        if (i < j && hit(a.r, b.r)) bad.push("labels overlap");
      });
      others.forEach((b) => {
        if (hit(a.r, b.r)) bad.push(`label overlaps ${b.c}`);
      });
      if (a.r.height > 0 && a.r.height < 11) bad.push(`label too small (${a.r.height.toFixed(1)}px)`);
    });
    const notes = items.filter((o) => o.c === "ors__note");
    const dials = items.filter((o) => o.c === "ors__dial");
    notes.forEach((a) => dials.forEach((b) => {
      if (hit(a.r, b.r)) bad.push("note overlaps a ring");
    }));
    const figure = items.find((o) => o.c === "figure");
    if (figure && figure.r.height < 80) bad.push(`figure too small (${Math.round(figure.r.height)}px)`);
    const pie = items.find((o) => o.c === "pie");
    if (pie && pie.r.height < 120) bad.push(`pie too small (${Math.round(pie.r.height)}px)`);
    if (scr.scrollHeight - scr.clientHeight > 1) bad.push(`inner overflow of ${scr.scrollHeight - scr.clientHeight}px`);
    return [...new Set(bad)];
  }, screen);
}

async function goTo(page: Page, i: number) {
  await page.evaluate((i) => {
    const s = document.querySelector<HTMLElement>(".scroller");
    const h = s?.querySelector<HTMLElement>(".screen")?.offsetHeight ?? 1;
    s?.scrollTo({ top: i * h, behavior: "instant" });
  }, i);
  // Wait until the screen has settled: its layers rest at zero offset.
  await page.waitForFunction((i) => {
    const layers = [...document.querySelectorAll<HTMLElement>(`.screen[data-screen="${i}"] .layer`)];
    return layers.length > 0 && layers.every((l) => l.style.opacity === "1" && /\(0px, 0(\.0)?px, 0px\)/.test(l.style.transform));
  }, i);
  await page.waitForTimeout(60);
}

test.skip(({ isMobile }) => isMobile, "viewport is set explicitly; one project is enough");

for (const [w, h] of SIZES) {
  test(`every screen fits at ${w}x${h}`, async ({ page }) => {
    test.setTimeout(240_000);
    await page.setViewportSize({ width: w, height: h });
    const problems: string[] = [];
    for (const lang of ["en", "es"]) {
      for (const theme of ["night", "day"]) {
        await page.goto(`/?lang=${lang}&theme=${theme}#/g/849799/MIL/1`);
        for (const team of ["MIL", "TB"]) {
          await page.getByRole("combobox", { name: lang === "en" ? "Team" : "Equipo", exact: true }).selectOption(team);
          await expect(page.locator('.screen[data-screen="0"]')).toBeVisible();
          await page.waitForTimeout(300);
          for (let i = 0; i < 10; i++) {
            await goTo(page, i);
            for (const f of await audit(page, i)) problems.push(`${lang} ${theme} ${team} screen ${i}: ${f}`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
}

test("every game and team fits, on a laptop and a phone", async ({ page }) => {
  test.setTimeout(240_000);
  const index = await (await page.request.get("/data/index.json")).json() as { games: { game_pk: number; away_abbr: string; home_abbr: string }[] };
  const problems: string[] = [];
  for (const [w, h] of [[1440, 900], [390, 664]] as const) {
    await page.setViewportSize({ width: w, height: h });
    for (const g of index.games) {
      for (const team of [g.away_abbr, g.home_abbr]) {
        await page.goto(`/?lang=es#/g/${g.game_pk}/${team}/1`);
        await expect(page.locator('.screen[data-screen="0"]')).toBeVisible();
        await page.waitForTimeout(200);
        for (let i = 0; i < 10; i++) {
          await goTo(page, i);
          for (const f of await audit(page, i)) problems.push(`${w}x${h} ${g.game_pk} ${team} screen ${i}: ${f}`);
        }
      }
    }
  }
  expect(problems).toEqual([]);
});
