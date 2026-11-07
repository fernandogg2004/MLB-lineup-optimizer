import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { prefersReducedMotion } from "../../home/format";
import type { GameSnapshot } from "../../data";
import { useI18n } from "../../i18n-context";
import { STATS_SECTIONS, statsHash } from "../../route";
import type { StatsSection } from "../../route";
import type { Key } from "../../strings";
import { Reveal } from "./kit";
import { ModelSection } from "./ModelSection";
import { Optimization } from "./Optimization";
import { Overview } from "./Overview";
import { Scoring } from "./Scoring";
import { Uncertainty } from "./Uncertainty";
import type { Validation } from "./validation";
import { ValidationSection } from "./ValidationSection";

const REPO = "https://github.com/fernandogg2004/mlb-lineup-optimizer";

function Section(props: { id: StatsSection; title: string; lead: string; h1?: boolean; children: ReactNode }) {
  const { t } = useI18n();
  const Head = props.h1 ? "h1" : "h2";
  return (
    <section id={`st-${props.id}`} className="st-section" aria-labelledby={`st-${props.id}-h`} data-kind={props.id}>
      <div className="st-inner">
        <Reveal className="st-head">
          <p className="st-kicker">{t(`st.nav_${props.id}` as Key)}</p>
          <Head id={`st-${props.id}-h`} className="st-title" tabIndex={-1}>
            {props.title}
          </Head>
          <p className="st-lead">{props.lead}</p>
        </Reveal>
        <Reveal className="st-body">{props.children}</Reveal>
      </div>
    </section>
  );
}

export function StatsPage(props: {
  snap: GameSnapshot;
  side: "away" | "home";
  pk: number;
  v: Validation | null;
  vFailed: boolean;
  section?: StatsSection;
  after: ReactNode;
}) {
  const { t, int } = useI18n();
  const { snap, side, pk, v } = props;
  const team = snap.teams[side];
  const [active, setActive] = useState<StatsSection>("overview");
  const [player, setPlayer] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const teamKey = `${snap.game.game_pk}-${team.team}`;
  const [seenKey, setSeenKey] = useState(teamKey);
  if (seenKey !== teamKey) {
    // A player number means nothing on another team's lineup.
    setSeenKey(teamKey);
    setPlayer(null);
  }

  useEffect(() => {
    const els = STATS_SECTIONS.map((s) => document.getElementById(`st-${s}`)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id.slice(3) as StatsSection);
        }
      },
      { rootMargin: "-35% 0px -60% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const el = strip.current?.querySelector<HTMLElement>('[aria-current="location"]');
    const box = strip.current;
    if (el && box && box.scrollWidth > box.clientWidth) box.scrollTo({ left: el.offsetLeft - 16, behavior: "auto" });
  }, [active]);

  const go = (s: StatsSection, focus = true) => {
    const el = document.getElementById(`st-${s}`);
    if (!el) return;
    el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
    if (focus) document.getElementById(`st-${s}-h`)?.focus({ preventScroll: true });
    window.history.replaceState(null, "", statsHash("game", pk, team.team, s === "overview" ? undefined : s));
  };

  // An address that names a section opens there.
  const wanted = props.section;
  const opened = useRef(false);
  useEffect(() => {
    if (!wanted || opened.current) return;
    opened.current = true;
    document.getElementById(`st-${wanted}`)?.scrollIntoView({ behavior: "auto", block: "start" });
  }, [wanted]);

  const shared = { player, setPlayer };
  return (
    <div className="st-page">
      <nav className="st-nav" aria-label={t("stats.tabs")}>
        <div className="st-nav-strip" ref={strip}>
          {STATS_SECTIONS.map((s) => (
            <button key={s} type="button" aria-current={active === s ? "location" : undefined} onClick={() => go(s)}>
              {t(`st.nav_${s}` as Key)}
            </button>
          ))}
          <span className="st-nav-gap" />
          <a href={statsHash("simulator", pk, team.team)}>{t("nav.simulator")}</a>
          <a href={`${import.meta.env.BASE_URL}paper.pdf`}>{t("nav.paper")}</a>
          <a href={REPO} rel="noopener">{t("nav.code")}</a>
        </div>
      </nav>

      <Section id="overview" h1 title={t("st.h_overview")} lead={t("st.lead_overview", { n: int(team.all_orders.count) })}>
        <Overview snap={snap} team={team} />
      </Section>
      <Section id="optimization" title={t("st.h_optimization")} lead={t("st.lead_optimization")}>
        <Optimization team={team} g={teamKey} />
      </Section>
      <Section id="scoring" title={t("st.h_scoring")} lead={t("st.lead_scoring")}>
        <Scoring snap={snap} team={team} {...shared} />
      </Section>
      <Section id="model" title={t("st.h_model")} lead={t("st.lead_model")}>
        <ModelSection snap={snap} team={team} v={v} {...shared} />
      </Section>
      <Section id="uncertainty" title={t("st.h_uncertainty")} lead={t("st.lead_uncertainty")}>
        <Uncertainty snap={snap} team={team} v={v} {...shared} />
      </Section>
      <Section id="validation" title={t("st.h_validation")} lead={t("st.lead_validation")}>
        <ValidationSection v={v} failed={props.vFailed} />
      </Section>
      <section className="st-section st-after">
        <div className="st-inner">{props.after}</div>
      </section>
    </div>
  );
}
