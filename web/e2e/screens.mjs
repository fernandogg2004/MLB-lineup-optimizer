// Renders key pages to PNG for visual review: node e2e/screens.mjs <baseUrl> <outDir>
import { chromium } from "@playwright/test";
const [base, out] = process.argv.slice(2);
const browser = await chromium.launch();
const errors = [];
for (const [name, vp] of [["desktop", { width: 1280, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  for (const lang of ["en", "es"]) {
    const page = await browser.newPage({ viewport: vp });
    page.on("console", (m) => m.type() === "error" && errors.push(`${name}/${lang}: ${m.text()}`));
    page.on("pageerror", (e) => errors.push(`${name}/${lang}: ${e.message}`));
    await page.goto(`${base}/?lang=${lang}#/`);
    await page.waitForSelector(".stat-value", { timeout: 20000 });
    await page.screenshot({ path: `${out}/game-${name}-${lang}.png`, fullPage: true });
    if (lang === "en") {
      await page.goto(`${base}/?lang=${lang}#/method`);
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${out}/method-${name}-${lang}.png`, fullPage: true });
    }
    await page.close();
  }
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "no console errors");
