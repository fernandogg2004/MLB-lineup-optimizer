import { useMemo } from "react";
import BatterFigure from "../components/ui/batter-figure";
import OrbitRingStats, { type Orbit } from "../components/ui/orbit-ring-stats";
import type { HomeData, HomeTeam, Rate } from "../data";
import { useI18n } from "../i18n-context";
import type { Key } from "../strings";
import type { Theme } from "../theme";
import { ordinal } from "./derive";
import { percentText, useNarrow } from "./format";
import { Pie } from "./Pie";
import { kitFor } from "./teams";

const RATES: Rate[] = ["avg", "obp", "slg", "ops"];
const POSITIONS = new Set(["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH", "P", "PH"]);

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
}) {
  const { data, team, slot, theme, active, vsBullpen, setVsBullpen, photo } = props;
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
          return { label: k.toUpperCase(), value: 0, max: 100, display: "—", orbit: name, note: t("home.nodata"), hint: name, valueText: `${name}: ${t("home.nodata")}` };
        }
        const pctile = t("home.pctile", { ord: lang === "es" ? String(pct) : ordinal(pct, "en") });
        const hint = t("home.better", { name, pct: percentText(pct, lang) });
        return {
          label: k.toUpperCase(),
          value: pct,
          max: 100,
          display: value,
          orbit: name,
          note: pctile,
          hint,
          valueText: `${value}, ${pctile}. ${hint}.`,
        };
      }),
    [b, t, lang],
  );

  const slotName = ordinal(slot + 1, lang);
  const seasonCaption = data.hitting.previous_season
    ? t("home.season_prev", { season: data.hitting.season })
    : t("home.season");
  return (
    <section className={`screen batter ${slot % 2 ? "flip" : ""}`} data-screen={slot} aria-label={`${slotName}: ${h.name}`}>
      <div className="pic">
        <div className="layer pic-text" data-depth="0.28">
        {slot === 0 && <p className="intro">{t("home.intro")}</p>}
        <p className="kicker">{t("home.kicker", { team: team.name, n: slot + 1 })}</p>
        <h2 className="who">
          <span>
            {slotName}
            {lang === "en" ? "." : ""}
          </span>{" "}
          {h.name}
        </h2>
        <p className="pos">
          {POSITIONS.has(h.pos) ? t(`pos.${h.pos}` as Key) : h.pos} · {hitterIndex === slot ? t("home.same") : t("home.was", { slot: ordinal(hitterIndex + 1, lang) })}
        </p>
        </div>
        <div className="layer figure" data-depth="0.46">
          {photo ? (
            <img src={`${import.meta.env.BASE_URL}players/${photo.file}`} alt={h.name} loading="lazy" />
          ) : (
            <BatterFigure facing={facing} shirt={kit.shirt} accent={kit.accent} title={t("home.figure", { name: h.name })} />
          )}
        </div>
      </div>
      <div className="data">
        <div className="layer rings" data-depth="0.2">
          <p className="caption">
            {seasonCaption}
            {b.small_sample && ` · ${t("home.small")}`}
          </p>
          <OrbitRingStats rings={rings} active={active} label={seasonCaption} theme={theme === "day" ? "paper" : "night"} />
        </div>
        <div className="layer outcome" data-depth="0.08">
          <div className="pie-wrap">
            <p className="caption">{t("home.each")}</p>
            <Pie
              probs={vsBullpen ? h.probs_bullpen : h.probs_starter}
              caption={t("home.each")}
              against={vsBullpen ? t("home.bullpen") : t("home.starter", { name: team.opponent_starter.name })}
            />
          </div>
          <fieldset className="vs">
            <legend>{t("home.against")}</legend>
            <label>
              <input type="radio" name={`vs-${slot}`} checked={!vsBullpen} onChange={() => setVsBullpen(false)} /> {t("home.starter", { name: team.opponent_starter.name })}
            </label>
            <label>
              <input type="radio" name={`vs-${slot}`} checked={vsBullpen} onChange={() => setVsBullpen(true)} /> {t("home.bullpen")}
            </label>
          </fieldset>
        </div>
      </div>
    </section>
  );
}
