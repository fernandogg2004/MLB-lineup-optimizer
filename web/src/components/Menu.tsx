import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n-context";
import type { Theme } from "../theme";

/** Slide-in panel: near-black with white text in both appearance modes. */
export function Menu(props: {
  open: boolean;
  close: () => void;
  page: "home" | "statistics";
  go: (page: "home" | "statistics") => void;
  theme: Theme;
  setTheme: (t: Theme) => void;
}) {
  const { open, close, page, go, theme, setTheme } = props;
  const { t, lang, setLang } = useI18n();
  const [hover, setHover] = useState<number | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const glowAt = hover ?? (page === "home" ? 0 : 1);

  useEffect(() => {
    if (!open) return;
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key !== "Tab" || !panel.current) return;
      // Keep the keyboard inside the menu.
      const items = [...panel.current.querySelectorAll<HTMLElement>("button")];
      const at = items.indexOf(document.activeElement as HTMLElement);
      const next = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === items.length - 1 ? 0 : at + 1;
      e.preventDefault();
      items[next]?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <div className={`menu ${open ? "open" : ""}`} inert={!open} role="dialog" aria-modal="true" aria-label={t("app.name")}>
      <button className="menu-scrim" aria-label={t("menu.close")} tabIndex={-1} onClick={close} />
      <nav ref={panel} className="menu-panel" aria-label={t("a11y.nav")}>
        <button className="burger menu-close" aria-label={t("menu.close")} onClick={close}>
          <span />
          <span />
          <span />
        </button>
        <p className="menu-name">{t("app.name")}</p>
        <div className="menu-items" onPointerLeave={() => setHover(null)}>
          <span className="menu-glow" style={{ transform: `translateY(${glowAt * 56}px)` }} aria-hidden="true" />
          {(["home", "statistics"] as const).map((p, i) => (
            <button
              key={p}
              ref={i === 0 ? first : undefined}
              className="menu-item"
              aria-current={page === p ? "page" : undefined}
              onPointerEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              onClick={() => {
                setHover(null);
                go(p);
                close();
              }}
            >
              {t(p === "home" ? "menu.home" : "menu.statistics")}
            </button>
          ))}
        </div>
        <div className="menu-foot">
          <div className="menu-choice" role="group" aria-label={t("menu.appearance")}>
            {(["night", "day"] as const).map((m, i) => (
              <span key={m}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <button className={theme === m ? "on" : ""} aria-pressed={theme === m} onClick={() => setTheme(m)}>
                  {t(m === "night" ? "menu.night" : "menu.day")}
                </button>
              </span>
            ))}
          </div>
          <div className="menu-choice" role="group" aria-label={t("menu.language")}>
            {(["en", "es"] as const).map((l, i) => (
              <span key={l}>
                {i > 0 && <span aria-hidden="true"> · </span>}
                <button className={lang === l ? "on" : ""} aria-pressed={lang === l} lang={l} onClick={() => setLang(l)}>
                  {l.toUpperCase()}
                </button>
              </span>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
}
