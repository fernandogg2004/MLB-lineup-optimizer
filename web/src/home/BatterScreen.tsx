import { useMemo } from "react";
import BatterFigure from "../components/ui/batter-figure";
import type { FigureVariant } from "../components/ui/batter-poses";
import OrbitRingStats, { type Orbit } from "../components/ui/orbit-ring-stats";
import type { HomeData, HomeTeam, Rate } from "../data";
import { useI18n } from "../i18n-context";
import type { Key } from "../strings";
import type { Theme } from "../theme";
import { ordinal } from "./derive";
import { useNarrow } from "./format";
import { Pie } from "./Pie";
import { kitFor } from "./teams";

const RATES: Rate[] = ["avg", "obp", "slg", "ops"];

export interface PlayerPhoto {
  id: number;
  file: string;
  author: string;
  source: string;
  license: string;
}

export function BatterScreen(props: {
  data: HomeData;
  team: HomeTeam;
  slot: number;
  theme: Theme;
  active: boolean;
  vsBullpen: boolean;
  setVsBullpen: (b: boolean) => void;
  photo?: PlayerPhoto;
  figure: FigureVariant;
}) {
  const { data, team, slot, theme, active, vsBullpen, setVsBullpen, photo, figure } = props;
  const { t, lang } = useI18n();
  const narrow = useNarrow();
  const hitterIndex = team.optimal.order[slot];
  const h = team.hitters[hitterIndex];
  const b = h.batting;
  // The batter always looks towards the statistics.
  const facing = narrow || slot % 2 ? "left" : "right";
  const kit = kitFor(team.team);

  const rings = useMemo<Orbit[]>(
    () =>
      RATES.map((k) => {
        const name = t(`stat.${k}` as Key);
        const value = b.rates[k];
        const pct = b.pct[k];
        if (value === null || pct === null) {
          return { label: k.toUpperCase(), value: 0, max: 100, display: "—", note: t("home.nodata"), hint: t(`stat.${k}_def` as Key), valueText: `${name}: ${t("home.nodata")}` };
        }
        const pctile = t("home.pctile", { ord: lang === "es" ? String(pct) : ordinal(pct, "en") });
        const hint = t(`stat.${k}_def` as Key);
        return {
          label: k.toUpperCase(),
          value: pct,
          max: 100,
          display: value,
          note: pctile,
          hint,
          valueText: `${name}: ${value}, ${pctile}. ${hint}`,
        };
      }),
    [b, t, lang],
  );

  const slotName = ordinal(slot + 1, lang);
  const prior = data.hitting.previous_season;
  const seasonLabel = prior ? t("home.season_prev", { season: data.hitting.season }) : t("home.season");
  const starterNamed = t("home.starter_named", { name: team.opponent_starter.name });
  return (
    <section className={`screen batter ${slot % 2 ? "flip" : ""}`} data-screen={slot} aria-label={`${slotName}: ${h.name}`}>
      <div className="pic">
        <div className="layer pic-text" data-depth="0.28">
        <h2 className="who">
          <span>
            {slotName}
            {lang === "en" ? "." : ""}
          </span>{" "}
          {h.name}
        </h2>
        <p className="pos">{hitterIndex === slot ? t("home.same") : t("home.was", { slot: ordinal(hitterIndex + 1, lang) })}</p>
        </div>
        <div className="layer figure" data-depth="0.46">
          {photo ? (
            <img src={`${import.meta.env.BASE_URL}players/${photo.file}`} alt={h.name} loading="lazy" />
          ) : (
            <BatterFigure facing={facing} shirt={kit.shirt} accent={kit.accent} variant={figure} title={t("home.figure", { name: h.name })} />
          )}
        </div>
      </div>
      <div className="data">
        <div className="layer rings" data-depth="0.2">
          {/* Only the unusual cases are labelled: a small sample, or last season's numbers. */}
          {(prior || b.small_sample) && (
            <p className="caption">{[prior && seasonLabel, b.small_sample && t("home.small")].filter(Boolean).join(" · ")}</p>
          )}
          <OrbitRingStats rings={rings} active={active} label={seasonLabel} orbiting={false} theme={theme === "day" ? "paper" : "night"} />
        </div>
        <div className="layer outcome" data-depth="0.08">
          <div className="outcome-head">
            <p className="outcome-title">{t("home.each")}</p>
            <fieldset className="vs">
              <legend className="sr-only">{t("home.against")}</legend>
              <label>
                <input type="radio" name={`vs-${slot}`} aria-label={starterNamed} checked={!vsBullpen} onChange={() => setVsBullpen(false)} />
                <span>{t("home.starter")}</span>
                <em className="vs-hint">{t("home.starter_hint", { name: team.opponent_starter.name })}</em>
              </label>
              <label>
                <input type="radio" name={`vs-${slot}`} checked={vsBullpen} onChange={() => setVsBullpen(true)} />
                <span>{t("home.bullpen")}</span>
                <em className="vs-hint">{t("home.bullpen_hint")}</em>
              </label>
            </fieldset>
          </div>
          <div className="pie-wrap">
            <Pie probs={vsBullpen ? h.probs_bullpen : h.probs_starter} caption={t("home.each")} against={vsBullpen ? t("home.bullpen") : starterNamed} />
          </div>
        </div>
      </div>
    </section>
  );
}
