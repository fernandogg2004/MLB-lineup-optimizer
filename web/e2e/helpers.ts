import { expect, type Page } from "@playwright/test";

export const STUB_LOGO = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f4b923"/></svg>';

/** Tests do not depend on MLB's server being up; the real logos are checked on the deployed site. */
export const stubLogos = (page: Page) =>
  page.route("https://www.mlbstatic.com/**", (r) => r.fulfill({ contentType: "image/svg+xml", body: STUB_LOGO }));

/** Opens a top-bar selector and chooses an option by its value. */
export async function pick(page: Page, name: string, value: string) {
  const box = page.getByRole("combobox", { name, exact: true });
  await box.click();
  await page.locator(`.picker:has([aria-label="${name}"]) .picker-option[data-value="${value}"]`).click();
  await expect(box).toHaveAttribute("aria-expanded", "false");
}
