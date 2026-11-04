import { useEffect, useState } from "react";
import type { Lang } from "../strings";

/** Whole-number percent, spaced as each language writes it. */
export function percentText(n: number, lang: Lang): string {
  return lang === "es" ? `${n} %` : `${n}%`;
}

export function useMedia(query: string): boolean {
  const [match, setMatch] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setMatch(m.matches);
    on();
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Too short for one locked screen per batter: the page falls back to normal scrolling. */
export const FLOW_QUERY = "(max-height: 559px)";
/** Picture and statistics stack instead of sitting side by side. */
export const NARROW_QUERY = `(max-width: 820px), ${FLOW_QUERY}`;

export function useNarrow(): boolean {
  return useMedia(NARROW_QUERY);
}

export function useFlow(): boolean {
  return useMedia(FLOW_QUERY);
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
