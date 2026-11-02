import { createContext, useContext } from "react";
import type { Lang, Key } from "./strings";

export type { Key, Lang } from "./strings";

export interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: Key, vars?: Record<string, string | number>) => string;
  fmt: (v: number, digits?: number) => string;
  int: (v: number) => string;
  pct: (v: number, digits?: number) => string;
  date: (iso: string) => string;
  series: (s: string) => string;
  signed: (v: number, digits?: number) => string;
}

export const I18nContext = createContext<Ctx | null>(null);

export function useI18n(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error("useI18n outside provider");
  return c;
}
