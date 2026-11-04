import { useEffect, useState, type ReactNode } from "react";
import type { HomeData, HomeTeam } from "../data";
import { useI18n } from "../i18n-context";
import { bestToWorstGap, ordinal, splitTemplate, wholePercent } from "./derive";
import { percentText, prefersReducedMotion } from "./format";
import { summaryLines } from "./summary";

/** Digits spin while the screen approaches and land on the true value at the lock. */
function Roll({ value, on, spinning }: { value: string; on: boolean; spinning: boolean }) {
  const [shown, setShown] = useState(value);
  // Without motion, or away from this screen, the true value is simply on display.
  const resting = prefersReducedMotion() || (!on && !spinning);
  useEffect(() => {
    if (resting) return;
    let id = 0;
    const scramble = (settled: number) =>
      value
        .split("")
        .map((c, i) => (i < settled || !/\d/.test(c) ? c : String(Math.floor(Math.random() * 10))))
        .join("");
    if (!on) {
      const spin = () => {
        setShown(scramble(0));
        id = window.setTimeout(spin, 70);
      };
      spin();
      return () => window.clearTimeout(id);
    }
    const start = performance.now();
    const duration = 1100;
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / duration);
      const eased = 1 - (1 - k) ** 3;
      setShown(scramble(Math.floor(eased * value.length)));
      if (k < 1) id = window.setTimeout(tick, 40 + 130 * k);
      else setShown(value);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [on, resting, value]);
  return <strong className="roll">{resting ? value : shown}</strong>;
}

export function SummaryScreen({ data, team, on, spinning }: { data: HomeData; team: HomeTeam; on: boolean; spinning: boolean }) {
  const { t, lang, fmt, signed, int } = useI18n();
  const whole = (p: number, percent: boolean) => {
    const w = wholePercent(p);
    const n = percent ? percentText(w.n, lang) : String(w.n);
    if (w.kind === "more") return t("cap.more", { n });
    if (w.kind === "less") return t("cap.less", { n });
    return n;
  };
  const lines = summaryLines(team, { fmt, signed, whole, ord: (n) => ordinal(n, lang) });
  const g = data.game;
  const hasScore = g.away_runs !== null && g.home_runs !== null;
  return (
    <section className="screen summary" data-screen={9} aria-label={t("sum.head")}>
      <div className="layer sum-inner" data-depth="0.16">
        <h2>{t("sum.head")}</h2>
        <ul className="sum-list">
          {lines.map((l) => {
            const plain = new Set(l.plain ?? []);
            const parts: ReactNode[] = splitTemplate(t(l.key)).map((p, i) => {
              if (p.text !== undefined) return p.text;
              const value = l.vars[p.slot ?? ""];
              return plain.has(p.slot ?? "") ? value : <Roll key={i} value={value} on={on} spinning={spinning} />;
            });
            return (
              <li key={l.key}>
                <span className="sr-only">{t(l.key, l.vars)}</span>
                <span aria-hidden="true">{parts}</span>
              </li>
            );
          })}
        </ul>
        <p className="sum-context">
          {t("sum.context", {
            rank: whole(team.actual.percentile, true),
            count: int(team.all_orders.count),
            gap: fmt(bestToWorstGap(team), 2),
          })}
        </p>
        <p className="sum-foot">
          {hasScore && `${t("sum.final", { score: `${g.away_abbr} ${g.away_runs}–${g.home_runs} ${g.home_abbr}` })} `}
          {t("sum.note")}
        </p>
        <p className="sum-link">
          <a className="link" href="#/statistics">
            {t("sum.link")}
          </a>
        </p>
      </div>
    </section>
  );
}
