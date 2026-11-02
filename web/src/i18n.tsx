import { useCallback, useEffect, useMemo, useState } from "react";
import { I18nContext } from "./i18n-context";
import type { Ctx } from "./i18n-context";
import type { ReactNode } from "react";

import { dictionaries } from "./strings";
import type { Key, Lang } from "./strings";

function initialLang(): Lang {
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "en" || q === "es") return q;
  const stored = window.localStorage.getItem("lang");
  if (stored === "en" || stored === "es") return stored;
  return navigator.language.toLowerCase().startsWith("es") ? "es" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem("lang", lang);
    // Keep a shared URL in sync with the visible language.
    const url = new URL(window.location.href);
    if (url.searchParams.get("lang") !== lang) {
      url.searchParams.set("lang", lang);
      window.history.replaceState(null, "", url);
    }
  }, [lang]);
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const value = useMemo<Ctx>(() => {
    const locale = lang === "es" ? "es-ES" : "en-US";
    // "always": group thousands consistently (es-ES otherwise leaves 4-digit numbers ungrouped).
    const grouping = { useGrouping: "always" } as unknown as Intl.NumberFormatOptions;
    const fmt = (v: number, digits = 2) =>
      new Intl.NumberFormat(locale, { ...grouping, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    const pct = (v: number, digits = 0) => {
      if (v > 0 && v < 0.01 && digits === 0) return lang === "es" ? "<1 %" : "<1%";
      return new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(v);
    };
    return {
      lang,
      setLang,
      t: (k, vars) => {
        let s = dictionaries[lang][k] ?? dictionaries.en[k];
        if (vars) for (const [name, v] of Object.entries(vars)) s = s.split(`{${name}}`).join(String(v));
        return s;
      },
      fmt,
      int: (v) => new Intl.NumberFormat(locale, { ...grouping, maximumFractionDigits: 0 }).format(Math.round(v)),
      pct,
      date: (iso) =>
        new Date(`${iso}T12:00:00Z`).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }),
      series: (s) => {
        const k = `series.${s}` as Key;
        return k in dictionaries.en ? dictionaries[lang][k] : s;
      },
      signed: (v, digits = 3) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), digits),
    };
  }, [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
