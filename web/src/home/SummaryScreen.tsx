import { useEffect, useState, type CSSProperties } from "react";
import { Baseball } from "../components/BarIcons";
import type { HomeData, HomeTeam } from "../data";
import { useI18n } from "../i18n-context";
import type { Key } from "../strings";
import { bestToWorstGap, runSpread, runsGained } from "./derive";
import { percentText, prefersReducedMotion } from "./format";
import { beatsOutOf100, runGroups, upgradeSize } from "./summary";
import "./summary.css";

/** Digits spin while the screen approaches and land on the true value at the lock. */
function Roll({ value, on, spinning, className = "roll" }: { value: string; on: boolean; spinning: boolean; className?: string }) {
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
  segments: (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="11" width="7" height="10" rx="2" opacity=".45" />
      <rect x="10.5" y="11" width="11" height="10" rx="2" />
      <rect x="23" y="11" width="7" height="10" rx="2" opacity=".7" />
    </svg>
  ),
};

/** Colours from the pie, from the worst situation (no runs) to the best (five or more). */
const GROUP_COLOURS = ["var(--pie-k)", "var(--pie-gb)", "var(--pie-air)", "var(--pie-xbh)", "var(--pie-single)", "var(--pie-hr)"];

/** A ball that flies in from the left each time the screen is reached, then hangs in mid-air. */
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
      <span className="fly-ball">
        <Baseball gold={false} />
      </span>
    </div>
  );
}

export function SummaryScreen({ team, on, spinning }: { data: HomeData; team: HomeTeam; on: boolean; spinning: boolean }) {
  const { t, lang, fmt, signed } = useI18n();
  const size = upgradeSize(team);
  const gain = runsGained(team);
  const gainText = gain < 0.005 ? `<${signed(0.01, 2)}` : signed(gain, 2);
  const beats = beatsOutOf100(team.uncertainty.p_opt_better);
  const groups = runGroups(team.optimal.run_distribution);
  const max = Math.max(team.optimal.er9, team.actual.er9);
  const bars = [
    { key: "opt", label: t("sum.optimized"), value: team.optimal.er9 },
    { key: "act", label: t("sum.actual"), value: team.actual.er9 },
  ];
  const pct = (n: number) => percentText(n, lang);
  const runs = fmt(team.optimal.er9, 2);
  const worstGap = fmt(bestToWorstGap(team), 2);

  return (
    <section className="screen summary" data-screen={9} data-on={on || undefined} aria-label={t("sum.head")}>
      <div className="layer sum-inner" data-depth="0.16">
        <FlyingBall on={on} />
        <h2 className="sum-title">{size === "none" ? t("sum.title_none") : t("sum.title", { adj: t(`sum.adj_${size}` as Key) })}</h2>
        <p className="sum-sub">{t("sum.sub", { team: team.name })}</p>

        <div className="sum-top">
          <div className="sum-card sum-runs">
            <span className="sum-icon icon-blue">{Icon.bars}</span>
            <div className="sum-stat">
              <span className="sum-label">{t("sum.expected")}</span>
              <Roll className="sum-number" value={runs} on={on} spinning={spinning} />
            </div>
            <p className="sum-good">
              {t("sum.worst_1")}
              <br />
              <strong>{t("sum.worst_2", { n: worstGap })}</strong>
              <br />
              {t("sum.worst_3")}
            </p>
            <svg className="sum-mark mark-seam" viewBox="0 0 60 120" aria-hidden="true">
              <path d="M52 -4C22 30 22 90 52 124" />
              <path className="stitch" d="M33 14l-9-4m6 16-9-2m7 14-9 0m8 14-9 2m10 12-8 4m10 10-7 6" />
            </svg>
          </div>
          <div className="sum-card sum-beats">
            <span className="sum-icon icon-gold">{Icon.trophy}</span>
            <div className="sum-stat">
              <span className="sum-label">{t("sum.beats_1")}</span>
              <span className="sum-number">
                <Roll value={beats} on={on} spinning={spinning} className="" />
                <span className="sum-of">/100</span>
              </span>
              <span className="sum-label-after">{t("sum.beats_3")}</span>
            </div>
            <svg className="sum-mark mark-trophy" viewBox="0 0 32 32" aria-hidden="true">
              <path d="M9 4h14v7a7 7 0 0 1-14 0zM14 17.6h4l.8 5.4h-5.6zM10.5 23.5h11a1 1 0 0 1 1 1V28h-13v-3.5a1 1 0 0 1 1-1z" />
            </svg>
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
              <p className="sum-good cmp-diff">
                <strong>{gainText}</strong>
                <br />
                {t("sum.per_game")}
              </p>
            </div>
          </figure>

          <figure className="sum-card sum-dist">
            <figcaption className="sum-card-title">
              <span className="sum-icon icon-blue small">{Icon.segments}</span>
              {t("sum.dist")}
            </figcaption>
            <div
              className="seg"
              role="img"
              aria-label={t("sum.dist_aria", { list: groups.map((g) => t("sum.runs_n", { n: g.label, p: pct(g.percent) })).join(", ") })}
            >
              <div className="seg-bar">
                {groups.map((g, i) => (
                  <span
                    key={g.label}
                    className="seg-part"
                    style={{ "--w": `${g.value * 100}%`, "--c": GROUP_COLOURS[i], "--delay": `${200 + i * 120}ms` } as CSSProperties}
                  />
                ))}
              </div>
              <div className="seg-labels" aria-hidden="true" style={{ gridTemplateColumns: groups.map((g) => `minmax(2.7em, ${Math.max(g.value, 0.001).toFixed(4)}fr)`).join(" ") }}>
                {groups.map((g, i) => (
                  <span key={g.label} className="seg-label" style={{ "--delay": `${450 + i * 120}ms` } as CSSProperties}>
                    <b>{g.label}</b>
                    <Roll value={pct(g.percent)} on={on} spinning={spinning} className="seg-pct" />
                  </span>
                ))}
              </div>
              <p className="seg-axis" aria-hidden="true">
                {t("sum.dist_axis")}
              </p>
            </div>
          </figure>
        </div>

        <p className="sum-foot">{t("sum.note", { sd: fmt(runSpread(team), 1) })}</p>
        <p className="sum-link">
          <a className="link" href="#/statistics">
            {t("sum.link")}
          </a>
        </p>
      </div>
    </section>
  );
}
