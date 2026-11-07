import { useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { niceTicks } from "../../components/ticks";
import type { GameSnapshot, Team } from "../../data";
import { useMedia } from "../../home/format";
import { useI18n } from "../../i18n-context";
import type { Key } from "../../strings";
import { ABSORB } from "../../engine/markov";
import { BASE_CODES, OUTCOMES, decodeState, lastName, outFloor, shade, transitions } from "./derive";
import { Bases, Chart, Figure, Seg } from "./kit";
import { Eq, Frac, I, N, O, Pi, Row, SubSup, Sub, SumOver, Sup, Tr, Tx, Up } from "./Math";
import type { Validation } from "./validation";

function useStateName() {
  const { t } = useI18n();
  return (s: number) => {
    const d = decodeState(s);
    return t("st.state_name", { outs: t(`st.outs_${d.outs}` as Key), bases: t(`st.bases_${d.code}` as Key) });
  };
}

function StateExplorer({ snap, v, s, setS }: { snap: GameSnapshot; v: Validation | null; s: number; setS: (n: number) => void }) {
  const { t, fmt, signed, int } = useI18n();
  const name = useStateName();
  const narrow = useMedia("(max-width: 640px)");
  const grid = useRef<HTMLDivElement>(null);
  const re = snap.run_expectancy;
  const flat = re.flat();
  const lo = Math.min(...flat);
  const hi = Math.max(...flat);
  const season = v?.e1?.by_season[snap.game.date.slice(0, 4)];
  const d = decodeState(s);
  const value = re[d.outs][d.code];
  const onKey = (e: KeyboardEvent) => {
    // Rows are outs on wide screens and bases on narrow ones; arrows follow what is on screen.
    const across = narrow ? 8 : 1;
    const down = narrow ? 1 : 8;
    const step = e.key === "ArrowRight" ? across : e.key === "ArrowLeft" ? -across : e.key === "ArrowDown" ? down : e.key === "ArrowUp" ? -down : 0;
    if (!step) return;
    e.preventDefault();
    const n = s + step;
    if (n < 0 || n > 23) return;
    setS(n);
    grid.current?.querySelector<HTMLElement>(`[data-s="${n}"]`)?.focus();
  };
  const cell = (o: number, c: number) => {
    const st = 8 * o + c;
    const b = decodeState(st);
    const val = re[o][c];
    return (
      <button
        key={st}
        type="button"
        data-s={st}
        className={`st-state heat-${shade(val, lo, hi)}`}
        aria-pressed={s === st}
        tabIndex={s === st ? 0 : -1}
        aria-label={t("st.state_cell", { name: name(st), v: fmt(val, 2) })}
        onClick={() => setS(st)}
      >
        <Bases first={b.first} second={b.second} third={b.third} size={24} />
        <span>{fmt(val, 2)}</span>
      </button>
    );
  };
  return (
    <Figure title={t("st.state_title")} sub={t("st.state_sub")} read={t("st.re_read")}>
      <div className="st-state-wrap">
        <div>
          <div ref={grid} className={narrow ? "st-states st-states-narrow" : "st-states"} role="group" aria-label={t("st.state_title")} onKeyDown={onKey}>
            {narrow ? (
              <>
                <span />
                {[0, 1, 2].map((o) => (
                  <span key={o} className="st-state-head">{t(`st.outs_${o}` as Key)}</span>
                ))}
                {BASE_CODES.map((c) => (
                  <div key={c} className="st-state-row">
                    <span className="st-state-head">{t(`st.basesh_${c}` as Key)}</span>
                    {[0, 1, 2].map((o) => cell(o, c))}
                  </div>
                ))}
              </>
            ) : (
              <>
                <span />
                {BASE_CODES.map((c) => (
                  <span key={c} className="st-state-head">{t(`st.basesh_${c}` as Key)}</span>
                ))}
                {[0, 1, 2].map((o) => (
                  <div key={o} className="st-state-row">
                    <span className="st-state-head">{t(`st.outs_${o}` as Key)}</span>
                    {BASE_CODES.map((c) => cell(o, c))}
                  </div>
                ))}
              </>
            )}
          </div>
          <p className="st-axis-note">{t("st.state_scale")}</p>
        </div>
        <div className="st-state-info">
          <Bases first={d.first} second={d.second} third={d.third} size={84} />
          <p className="st-h4">{name(s)}</p>
          <dl className="st-kv">
            <div>
              <dt>{t("st.re_game")}</dt>
              <dd>{fmt(value, 3)}</dd>
            </div>
            {season && (
              <>
                <div>
                  <dt>{t("st.re_season_model", { y: snap.game.date.slice(0, 4) })}</dt>
                  <dd>{fmt(season.model_re24[s], 3)}</dd>
                </div>
                <div>
                  <dt>{t("st.re_season_obs", { y: snap.game.date.slice(0, 4) })}</dt>
                  <dd>{fmt(season.empirical_re24[s], 3)}</dd>
                </div>
                <div>
                  <dt>{t("st.re_diff")}</dt>
                  <dd>{signed(season.model_re24[s] - season.empirical_re24[s], 3)}</dd>
                </div>
                <div>
                  <dt>{t("st.re_visits")}</dt>
                  <dd>{int(season.n_by_state[s])}</dd>
                </div>
              </>
            )}
          </dl>
        </div>
      </div>
      <details className="st-tech">
        <summary>{t("st.re_how")}</summary>
        <Eq label={t("st.re_formula")}>
          <Up>RE</Up>
          <O>=</O>
          <Sup b={<Row><O>(</O><I>I</I><O>−</O><I>Q</I><O>)</O></Row>} s={<Row><O>−</O><N>1</N></Row>} />
          <I>ρ</I>
          <O>,</O>
          <Tx>&#8195;</Tx>
          <I>Q</I>
          <O>=</O>
          <SumOver from={<I>c</I>} />
          <Sub b={<I>x</I>} s={<I>c</I>} />
          <Sub b={<I>P</I>} s={<I>c</I>} />
        </Eq>
        <p>{t("st.re_how_text")}</p>
      </details>
    </Figure>
  );
}

function TransitionView({ snap, s }: { snap: GameSnapshot; s: number }) {
  const { t, fmt, pct, int } = useI18n();
  const name = useStateName();
  const [c, setC] = useState(2);
  const { rows, expectedRuns } = transitions(snap, c, s);
  const top = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((a, r) => a + r.p, 0);
  const kernel = snap.cutoff.kernel as { n_transitions?: number };
  return (
    <Figure
      title={t("st.tr_title")}
      sub={t("st.tr_sub", { state: name(s), n: int(kernel.n_transitions ?? 0) })}
      read={t("st.tr_read", { r: fmt(expectedRuns, 3) })}
    >
      <div className="st-chips" role="group" aria-label={t("st.tr_outcome")}>
        {OUTCOMES.map((o, i) => (
          <button key={o} type="button" aria-pressed={c === i} onClick={() => setC(i)}>
            {t(`outcome.${o}` as Key)}
          </button>
        ))}
      </div>
      <ul className="st-trans">
        {top.map((r) => {
          const b = decodeState(r.next);
          return (
            <li key={r.next}>
              {r.next === ABSORB ? <span className="st-trans-end" aria-hidden="true">3</span> : <Bases first={b.first} second={b.second} third={b.third} size={30} />}
              <span className="st-trans-name">
                {r.next === ABSORB ? t("st.tr_end") : name(r.next)}
                <small>{r.runs === null ? t("st.tr_end_runs") : t("st.tr_runs", { n: r.runs })}</small>
              </span>
              <span className="st-hbar-track"><span className="st-hbar st-hbar-neutral" style={{ width: `${r.p * 100}%` }} /></span>
              <span className="st-hbar-val">{pct(r.p, 1)}</span>
            </li>
          );
        })}
        {rest > 0 && (
          <li>
            <span />
            <span className="st-trans-name">{t("st.tr_other", { n: rows.length - 6 })}</span>
            <span className="st-hbar-track"><span className="st-hbar st-hbar-neutral" style={{ width: `${rest * 100}%` }} /></span>
            <span className="st-hbar-val">{pct(rest, 1)}</span>
          </li>
        )}
      </ul>
    </Figure>
  );
}

function OutcomeHeat({ team, player, setPlayer }: { team: Team; player: number | null; setPlayer: (p: number | null) => void }) {
  const { t, fmt, int } = useI18n();
  const [regime, setRegime] = useState<"probs_starter" | "probs_bullpen">("probs_starter");
  const cols = OUTCOMES.map((_, c) => team.hitters.map((h) => h[regime][c]));
  const ranges = cols.map((v) => [Math.min(...v), Math.max(...v)]);
  return (
    <Figure
      title={t("st.out_title")}
      sub={t("st.out_sub", { pitcher: team.opponent_starter.name, n: int(Math.round(team.opponent_starter.history_pa)) })}
      controls={
        <Seg
          label={t("home.against")}
          value={regime}
          onChange={setRegime}
          options={[
            { value: "probs_starter", label: t("home.starter") },
            { value: "probs_bullpen", label: t("home.bullpen") },
          ]}
        />
      }
      read={t("st.out_read")}
    >
      <div className="st-scroll" tabIndex={0} role="region" aria-label={t("st.out_title")}>
        <table className="st-heat st-heat-wide">
          <thead>
            <tr>
              <th scope="col">{t("lineup.player")}</th>
              {OUTCOMES.map((o) => (
                <th key={o} scope="col" className="num"><abbr title={t(`outcome.${o}` as Key)}>{o}</abbr></th>
              ))}
            </tr>
          </thead>
          <tbody>
            {team.hitters.map((h, p) => (
              <tr key={h.id} data-on={player === p || undefined}>
                <th scope="row">
                  <button type="button" className="st-rowname" aria-pressed={player === p} onClick={() => setPlayer(player === p ? null : p)}>
                    {lastName(h.name)}
                  </button>
                  <small>{t("st.out_ctx", { n: int(Math.round(h.history_pa)), side: h.side_vs_starter })}</small>
                </th>
                {h[regime].map((v, c) => (
                  <td key={c} className={`num heat-${shade(v, ranges[c][0], ranges[c][1])}`} title={`${h.name}, ${t(`outcome.${OUTCOMES[c]}` as Key)}: ${fmt(v * 100, 2)}%`}>
                    {fmt(v * 100, 1)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="st-axis-note">{t("st.out_scale")}</p>
      <details className="st-tech">
        <summary>{t("st.out_how")}</summary>
        <Eq label={t("st.out_log5")}>
          <I>φ</I><O>(</O><I>c</I><O>∣</O><I>b</I><O>,</O><I>p</I><O>)</O><O>=</O>
          <Frac
            n={<Row><Sub b={<I>ℓ</I>} s={<I>h</I>} /><O>(</O><I>c</I><O>)</O><Sub b={<I>m</I>} s={<I>b</I>} /><O>(</O><I>c</I><O>)</O><Sub b={<I>m</I>} s={<I>p</I>} /><O>(</O><I>c</I><O>)</O></Row>}
            d={<Row><SumOver from={<Sup b={<I>c</I>} s={<O>′</O>} />} /><Sub b={<I>ℓ</I>} s={<I>h</I>} /><O>(</O><Sup b={<I>c</I>} s={<O>′</O>} /><O>)</O><Sub b={<I>m</I>} s={<I>b</I>} /><O>(</O><Sup b={<I>c</I>} s={<O>′</O>} /><O>)</O><Sub b={<I>m</I>} s={<I>p</I>} /><O>(</O><Sup b={<I>c</I>} s={<O>′</O>} /><O>)</O></Row>}
          />
        </Eq>
        <Eq label={t("st.out_post")}>
          <Sub b={<I>m</I>} s={<I>b</I>} /><O>(</O><I>c</I><O>)</O><O>∣</O><Tx>data</Tx><O>∼</O><Up>Gamma</Up><O>(</O>
          <Sub b={<I>n</I>} s={<I>b</I>} /><O>(</O><I>c</I><O>)</O><O>+</O><Sub b={<I>a</I>} s={<I>c</I>} /><O>,</O>
          <Sub b={<I>e</I>} s={<I>b</I>} /><O>(</O><I>c</I><O>)</O><O>+</O><Sub b={<I>a</I>} s={<I>c</I>} /><O>)</O>
        </Eq>
        <p>{t("st.out_how_text")}</p>
      </details>
    </Figure>
  );
}

function Workload({ team }: { team: Team }) {
  const { t, pct } = useI18n();
  const w = team.regime_weights.map((r) => r[0]);
  const H = 260;
  const m = { l: 48, r: 16, t: 16, b: 46 };
  const x = (i: number, wd: number) => m.l + (i / 8) * (wd - m.l - m.r);
  const y = (v: number) => H - m.b - v * (H - m.t - m.b);
  return (
    <Figure
      title={t("st.work_title")}
      sub={t("st.work_sub", { pitcher: team.opponent_starter.name })}
      read={t("st.work_read")}
      table={
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{t("tech.inning")}</th>
              <th scope="col" className="num">{t("home.starter")}</th>
              <th scope="col" className="num">{t("home.bullpen")}</th>
            </tr>
          </thead>
          <tbody>
            {team.regime_weights.map((r, i) => (
              <tr key={i}>
                <th scope="row">{i + 1}</th>
                <td className="num">{pct(r[0], 1)}</td>
                <td className="num">{pct(r[1], 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
    >
      <Chart
        label={t("st.work_title")}
        height={H}
        count={9}
        indexAt={(px, _y, wd) => {
          const i = Math.round(((px - m.l) / (wd - m.l - m.r)) * 8);
          return i >= 0 && i <= 8 ? i : null;
        }}
        anchor={(i, wd) => ({ x: x(i, wd), y: Math.max(m.t + 50, y(w[i])) })}
        tip={(i) => (
          <>
            <b>{t("st.tip_inn", { n: i + 1 })}</b>
            <br />
            {t("home.starter")}: {pct(team.regime_weights[i][0], 1)}
            <br />
            {t("home.bullpen")}: {pct(team.regime_weights[i][1], 1)}
          </>
        )}
        draw={(wd, cur) => (
          <>
            {niceTicks(0, 1, 4).map((v) => (
              <g key={v}>
                <line x1={m.l} x2={wd - m.r} y1={y(v)} y2={y(v)} className="st-grid" />
                <text x={m.l - 8} y={y(v) + 4} textAnchor="end" className="st-tick">{pct(v)}</text>
              </g>
            ))}
            {w.map((_, i) => (
              <text key={i} x={x(i, wd)} y={H - m.b + 18} textAnchor="middle" className="st-tick">{i + 1}</text>
            ))}
            {cur !== null && <line x1={x(cur, wd)} x2={x(cur, wd)} y1={m.t} y2={H - m.b} className="st-cursor" />}
            <path d={w.map((v, i) => `${i ? "L" : "M"}${x(i, wd).toFixed(1)} ${y(v).toFixed(1)}`).join(" ")} className="st-line-neutral" />
            {w.map((v, i) => (
              <circle key={i} cx={x(i, wd)} cy={y(v)} r={3.6} className="st-pt-neutral" />
            ))}
            <text x={(m.l + wd - m.r) / 2} y={H - 8} textAnchor="middle" className="st-axis">{t("tech.inning")}</text>
          </>
        )}
      />
    </Figure>
  );
}

const Mg = () => <Sub b={<I>M</I>} s={<I>g</I>} />;

function MathDetails({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, fmt } = useI18n();
  const q = useMemo(() => outFloor(snap, team), [snap, team]);
  const [mant, exp] = ((162 * team.truncated_mass) / q).toExponential(1).split("e");
  const power = String(Number(exp)).replace(/[-\d]/g, (c) => "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"["-0123456789".indexOf(c)]);
  const seq = <Row><Pi /><O>(</O><I>j</I><O>+</O><I>n</I><O>)</O></Row>;
  return (
    <Figure title={t("st.math_title")} sub={t("st.math_sub")}>
      <details className="st-tech">
        <summary>{t("st.math_op")}</summary>
        <Eq label={t("st.math_op")}>
          <Mg /><O>(</O><I>i</I><O>)</O><O>=</O><SumOver from={<Row><I>c</I><O>∈</O><I>𝒞</I></Row>} />
          <Sub b={<I>x</I>} s={<I>g</I>} /><Sub b={<Row><O>(</O><I>i</I><O>)</O></Row>} s={<I>c</I>} /><Sub b={<I>P</I>} s={<I>c</I>} />
        </Eq>
        <p>{t("st.math_op_text")}</p>
      </details>
      <details className="st-tech">
        <summary>{t("st.math_rho")}</summary>
        <Eq label={t("st.math_rho")}>
          <Sub b={<I>ρ</I>} s={<I>g</I>} /><O>(</O><I>i</I><O>)</O><O>=</O><SumOver from={<I>c</I>} />
          <Sub b={<I>x</I>} s={<I>g</I>} /><Sub b={<Row><O>(</O><I>i</I><O>)</O></Row>} s={<I>c</I>} /><Sub b={<I>ρ</I>} s={<I>c</I>} />
        </Eq>
        <p>{t("st.math_rho_text")}</p>
      </details>
      <details className="st-tech">
        <summary>{t("st.math_inning")}</summary>
        <Eq label={t("st.math_inning")}>
          <Sub b={<I>v</I>} s={<N>0</N>} /><O>=</O><Sup b={<Sub b={<I>e</I>} s={<N>0</N>} />} s={<Tr />} /><O>,</O><Tx>&#8195;</Tx>
          <Sub b={<I>v</I>} s={<Row><I>n</I><O>+</O><N>1</N></Row>} /><O>=</O><Sub b={<I>v</I>} s={<I>n</I>} /><Mg /><O>(</O>{seq}<O>)</O>
        </Eq>
        <Eq label={t("st.math_inning_r")}>
          <Sub b={<I>r</I>} s={<I>g</I>} /><O>(</O><I>j</I><O>)</O><O>=</O><SumOver from={<Row><I>n</I><O>≥</O><N>0</N></Row>} />
          <Sub b={<I>v</I>} s={<I>n</I>} /><Sub b={<I>ρ</I>} s={<I>g</I>} /><O>(</O>{seq}<O>)</O>
        </Eq>
        <p>{t("st.math_inning_text")}</p>
      </details>
      <details className="st-tech">
        <summary>{t("st.math_chain")}</summary>
        <Eq label={t("st.math_chain")}>
          <Sub b={<I>L</I>} s={<I>g</I>} /><O>(</O><I>j</I><O>,</O><Sup b={<I>j</I>} s={<O>′</O>} /><O>)</O><O>=</O>
          <SumOver from={<Row><I>j</I><O>+</O><I>n</I><O>+</O><N>1</N><O>≡</O><Sup b={<I>j</I>} s={<O>′</O>} /></Row>} />
          <Sub b={<I>v</I>} s={<I>n</I>} /><Sub b={<Row><Mg /><O>(</O>{seq}<O>)</O></Row>} s={<Row><O>·</O><O>,</O><I>a</I></Row>} />
        </Eq>
        <Eq label={t("st.math_chain_mu")}>
          <Sub b={<I>μ</I>} s={<N>1</N>} /><O>=</O><Sub b={<I>e</I>} s={<N>1</N>} /><O>,</O><Tx>&#8195;</Tx>
          <SubSup b={<I>μ</I>} sub={<Row><I>k</I><O>+</O><N>1</N></Row>} sup={<Tr />} /><O>=</O><SubSup b={<I>μ</I>} sub={<I>k</I>} sup={<Tr />} /><Sub b={<I>L</I>} s={<I>k</I>} /><O>,</O><Tx>&#8195;</Tx>
          <Sub b={<I>L</I>} s={<I>k</I>} /><O>=</O><SumOver from={<I>g</I>} /><Sub b={<I>w</I>} s={<Row><I>k</I><O>,</O><I>g</I></Row>} /><Sub b={<I>L</I>} s={<I>g</I>} />
        </Eq>
        <p>{t("st.math_chain_text")}</p>
      </details>
      <details className="st-tech">
        <summary>{t("st.math_value")}</summary>
        <Eq label={t("st.math_value")}>
          <I>V</I><O>(</O><Pi /><O>)</O><O>=</O><SumOver from={<Row><I>k</I><O>=</O><N>1</N></Row>} to={<N>9</N>} />
          <SubSup b={<I>μ</I>} sub={<I>k</I>} sup={<Tr />} /><Sub b={<I>r</I>} s={<I>k</I>} /><O>,</O><Tx>&#8195;</Tx>
          <Sub b={<I>r</I>} s={<I>k</I>} /><O>=</O><SumOver from={<I>g</I>} /><Sub b={<I>w</I>} s={<Row><I>k</I><O>,</O><I>g</I></Row>} /><Sub b={<I>r</I>} s={<I>g</I>} />
        </Eq>
        <p>{t("st.math_value_text")}</p>
      </details>
      <details className="st-tech">
        <summary>{t("st.math_trunc")}</summary>
        <Eq label={t("st.math_trunc")}>
          <O>|</O><I>V</I><O>−</O><mover><mi>V</mi><mo>^</mo></mover><O>|</O><O>≤</O>
          <Frac n={<Row><N>162</N><I>ε</I></Row>} d={<I>q</I>} />
        </Eq>
        <p>{t("st.math_trunc_text", { q: fmt(q, 3), bound: `${fmt(Number(mant), 1)}×10${power}` })}</p>
      </details>
    </Figure>
  );
}

function Assumptions() {
  const { t } = useI18n();
  return (
    <section className="st-card" aria-labelledby="st-assume">
      <h3 id="st-assume" className="st-card-title">{t("st.as_title")}</h3>
      <p className="st-card-sub">{t("st.as_sub")}</p>
      <ol className="st-assume">
        {[1, 2, 3, 4, 5].map((n) => (
          <li key={n}>
            <span className="st-assume-id">A{n}</span>
            <div>
              <h4 className="st-h4">{t(`st.as_${n}` as Key)}</h4>
              <p>{t(`st.as_${n}_text` as Key)}</p>
              <p className="st-assume-so">{t(`st.as_${n}_so` as Key)}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ModelSection(props: { snap: GameSnapshot; team: Team; v: Validation | null; player: number | null; setPlayer: (p: number | null) => void }) {
  const { snap, team } = props;
  const [s, setS] = useState(1);
  return (
    <>
      <StateExplorer snap={snap} v={props.v} s={s} setS={setS} />
      <TransitionView snap={snap} s={s} />
      <OutcomeHeat team={team} player={props.player} setPlayer={props.setPlayer} />
      <div className="st-grid-2">
        <Workload team={team} />
        <MathDetails snap={snap} team={team} />
      </div>
      <Assumptions />
    </>
  );
}
