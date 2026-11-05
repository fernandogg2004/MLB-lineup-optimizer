import { useEffect, useState, type CSSProperties } from "react";
import { Baseball } from "../components/BarIcons";
import type { HomeData, HomeTeam } from "../data";
import { useI18n } from "../i18n-context";
import type { Key } from "../strings";
import { biggestMove, ordinal, runsGained } from "./derive";
import { percentText, prefersReducedMotion } from "./format";
import { beatsOutOf100, runGroups, upgradeSize } from "./summary";
import "./summary.css";

/**
 * Digits spin while the screen approaches and land on the true value at the lock. With `count`, a whole
 * number counts up from 0 instead, so a count out of 100 never shows more than its total on the way.
 */
function Roll({ value, on, spinning, className = "roll", count = false }: { value: string; on: boolean; spinning: boolean; className?: string; count?: boolean }) {
  const [shown, setShown] = useState(value);
  // Without motion, or away from this screen, the true value is simply on display.
  const resting = prefersReducedMotion() || (!on && !spinning);
  useEffect(() => {
    if (resting) return;
    let id = 0;
    const target = Number(value);
    const scramble = (settled: number) =>
      count
        ? String(Math.round(target * (settled / value.length)))
        : value
        .split("")
        .map((c, i) => (i < settled || !/\d/.test(c) ? c : String(Math.floor(Math.random() * 10))))
        .join("");
    if (!on) {
      const spin = () => {
        setShown(count ? "0" : scramble(0));
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
      setShown(count ? String(Math.round(target * eased)) : scramble(Math.floor(eased * value.length)));
      if (k < 1) id = window.setTimeout(tick, 40 + 130 * k);
      else setShown(value);
    };
    tick();
    return () => window.clearTimeout(id);
  }, [on, resting, value, count]);
  return <span className={className}>{resting ? value : shown}</span>;
}

const Icon = {
  bars: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="17" width="7" height="12" rx="1.5" />
      <rect x="12.5" y="11" width="7" height="18" rx="1.5" />
      <rect x="22" y="4" width="7" height="25" rx="1.5" />
    </svg>
  ),
  trophy: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <path className="trophy-cup" d="M9 4h14v7a7 7 0 0 1-14 0z" />
      <path className="trophy-handle" d="M9 6H4.5v2.5A5 5 0 0 0 9.6 13.4M23 6h4.5v2.5a5 5 0 0 1-5.1 4.9" />
      <path className="trophy-cup" d="M14 17.6h4l.8 5.4h-5.6zM10.5 23.5h11a1 1 0 0 1 1 1V28h-13v-3.5a1 1 0 0 1 1-1z" />
    </svg>
  ),
  target: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="15" cy="17" r="12" className="ring" />
      <circle cx="15" cy="17" r="7" className="ring" />
      <circle cx="15" cy="17" r="2.6" />
      <path className="ring" d="M15 17 27.5 4.5M23.5 3.5l4 1 1 4" />
    </svg>
  ),
  columns: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="18" width="5" height="10" rx="1.2" opacity=".55" />
      <rect x="10" y="8" width="5" height="20" rx="1.2" />
      <rect x="17" y="12" width="5" height="16" rx="1.2" opacity=".8" />
      <rect x="24" y="20" width="5" height="8" rx="1.2" opacity=".55" />
      <rect x="1" y="29" width="30" height="1.6" rx=".8" />
    </svg>
  ),
  rise: (
    <svg className="rise" viewBox="0 0 32 32" aria-hidden="true">
      <path d="M3 24 12 15l5 5 11-12" />
      <path d="M20 8h8v8" />
    </svg>
  ),
};

/** Colours from the pie, from the worst situation (no runs) to the best (five or more). */
const GROUP_COLOURS = ["var(--pie-k)", "var(--pie-gb)", "var(--pie-air)", "var(--pie-xbh)", "var(--pie-single)", "var(--pie-hr)"];

/** A ball thrown in on a parabola each time the screen is reached; it stops at the top of its arc. */
function FlyingBall({ on }: { on: boolean }) {
  const [throws, setThrows] = useState(0);
  useEffect(() => {
    if (on) setThrows((n) => n + 1); // eslint-disable-line react/set-state-in-effect -- replays on each arrival
  }, [on]);
  return (
    <div className={`fly ${on ? "fly-on" : ""}`} key={throws} aria-hidden="true">
      <span className="fly-lines">
        <i />
        <i />
        <i />
      </span>
      {/* Across at a steady pace, up while slowing: together, a parabola whose top is where it stops. */}
      <span className="fly-x">
        <span className="fly-y">
          <span className="fly-ball">
            <Baseball gold={false} />
          </span>
        </span>
      </span>
    </div>
  );
}

export function SummaryScreen({ team, on, spinning }: { data: HomeData; team: HomeTeam; on: boolean; spinning: boolean }) {
  const { t, lang, fmt, signed, int } = useI18n();
  const size = upgradeSize(team);
  const gain = runsGained(team);
  const gainText = gain < 0.005 ? `<${signed(0.01, 2)}` : signed(gain, 2);
  const beats = beatsOutOf100(team.uncertainty.p_opt_better);
  const groups = runGroups(team.optimal.run_distribution);
  const tallest = Math.max(...groups.map((g) => g.value));
  const max = Math.max(team.optimal.er9, team.actual.er9);
  const bars = [
    { key: "opt", label: t("sum.optimized"), value: team.optimal.er9 },
    { key: "act", label: t("sum.actual"), value: team.actual.er9 },
  ];
  const pct = (n: number) => percentText(n, lang);
  const runs = fmt(team.optimal.er9, 2);
  const move = biggestMove(team.optimal.order);

  return (
    <section className="screen summary" data-screen={9} data-on={on || undefined} aria-label={t("sum.head")}>
      <div className="layer sum-inner" data-depth="0.16">
        <h2 className="sum-title">
          <FlyingBall on={on} />
          {size === "none" ? t("sum.title_none") : t("sum.title", { adj: t(`sum.adj_${size}` as Key) })}
        </h2>

        <div className="sum-top">
          <div className="sum-card sum-runs">
            <span className="sum-icon icon-blue">{Icon.bars}</span>
            <div className="sum-stat">
              <span className="sum-label">{t("sum.expected")}</span>
              <Roll className="sum-number" value={runs} on={on} spinning={spinning} />
            </div>
            <p className="sum-good">
              {t("sum.best_1")}
              <br />
              <strong>{int(team.all_orders.count)}</strong>
              <br />
              {t("sum.best_3")}
            </p>
          </div>
          <div className="sum-card sum-beats">
            <span className="sum-icon icon-gold">{Icon.trophy}</span>
            <div className="sum-stat">
              <span className="sum-label">{t("sum.beats_1")}</span>
              <span className="sum-number">
                <Roll value={beats} on={on} spinning={spinning} className="" count />
                <span className="sum-of">/100</span>
              </span>
              <span className="sum-label-after">{t("sum.beats_3")}</span>
            </div>
            {move && (
              <div className="sum-move">
                <span className="sum-move-head">{t("sum.move")}</span>
                <span className="sum-move-name">{team.hitters[move.hitter].name}</span>
                <span className="sum-move-slots">
                  {ordinal(move.from + 1, lang)} <span aria-hidden="true">→</span>{" "}
                  <span className="sr-only">{t("sum.move_to")}</span> <b>{ordinal(move.to + 1, lang)}</b>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="sum-bottom">
          <figure className="sum-card sum-compare">
            <figcaption className="sum-card-title">
              <span className="sum-icon icon-blue small">{Icon.target}</span>
              {t("sum.compare")}
            </figcaption>
            <div className="cmp">
              <div className="cmp-bars">
                {bars.map((b, i) => (
                  <div className={`cmp-row cmp-${b.key}`} key={b.key}>
                    <span className="cmp-label">{b.label}</span>
                    <span className="cmp-track">
                      <span className="cmp-fill" style={{ "--w": `${(b.value / max) * 100}%`, "--delay": `${150 + i * 180}ms` } as CSSProperties}>
                        <span className="cmp-value">{fmt(b.value, 2)}</span>
                      </span>
                    </span>
                  </div>
                ))}
              </div>
              <p className="cmp-diff">
                <span className="cmp-gain">
                  {Icon.rise}
                  <strong>{gainText}</strong>
                </span>
                {t("sum.per_game")}
              </p>
            </div>
          </figure>

          <figure className="sum-card sum-dist">
            <figcaption className="sum-card-title">
              <span className="sum-icon icon-blue small">{Icon.columns}</span>
              {t("sum.dist")}
            </figcaption>
            <div
              className="dist"
              role="img"
              aria-label={t("sum.dist_aria", { list: groups.map((g) => t("sum.runs_n", { n: g.label, p: pct(g.percent) })).join(", ") })}
            >
              <div className="dist-cols" aria-hidden="true">
                {groups.map((g, i) => (
                  <div key={g.label} className="dist-col" style={{ "--hk": (g.value / tallest).toFixed(4), "--c": GROUP_COLOURS[i], "--delay": `${200 + i * 110}ms` } as CSSProperties}>
                    <span className="dist-plot">
                      <span className="dist-bar">
                        <Roll value={pct(g.percent)} on={on} spinning={spinning} className="dist-pct" />
                      </span>
                    </span>
                    <b className="dist-run">{g.label}</b>
                  </div>
                ))}
              </div>
              <p className="dist-axis" aria-hidden="true">
                {t("sum.dist_axis")}
              </p>
            </div>
          </figure>
        </div>

        <p className="sum-foot">{t("sum.note")}</p>
        <p className="sum-link">
          <a className="link" href="#/statistics">
            {t("sum.link")}
          </a>
        </p>
      </div>
    </section>
  );
}
