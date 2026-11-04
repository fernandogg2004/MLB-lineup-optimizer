/** Appearance: night is the default; the visitor's choice is remembered. */
export type Theme = "night" | "day";

const KEY = "bol-theme";

export function initialTheme(): Theme {
  const q = new URLSearchParams(window.location.search).get("theme");
  if (q === "night" || q === "day") return q;
  try {
    return window.localStorage.getItem(KEY) === "day" ? "day" : "night";
  } catch {
    return "night";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "day" ? "#a4d4f3" : "#06080c");
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* private browsing: the choice simply is not remembered */
  }
}
