import { useCallback, useEffect, useMemo, useState } from "react";
import { I18nContext } from "./i18n-context";
import type { Ctx } from "./i18n-context";
import type { ReactNode } from "react";

import { dictionaries } from "./strings";
import type { Lang } from "./strings";

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
  }, [lang]);
  const setLang = useCallback((l: Lang) => setLangState(l), []);
  const value = useMemo<Ctx>(() => {
    const locale = lang === "es" ? "es-ES" : "en-US";
    const fmt = (v: number, digits = 2) =>
      new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
    return {
      lang,
      setLang,
      t: (k, vars) => {
        let s = dictionaries[lang][k] ?? dictionaries.en[k];
        if (vars) for (const [name, v] of Object.entries(vars)) s = s.split(`{${name}}`).join(String(v));
        return s;
      },
      fmt,
      int: (v) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(v)),
      pct: (v, digits = 0) =>
        new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: digits }).format(v),
      signed: (v, digits = 3) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v), digits),
    };
  }, [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
