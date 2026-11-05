# Batting Order Lab

**How much does the batting order matter?** This project computes, exactly, the expected runs
of any MLB batting order under a statistically estimated model, finds the best order by checking
all 362,880 of them, and shows, in English and Spanish, how the two lineups of the
**2026 World Series Game 5** (Milwaukee 4, Tampa Bay 1) compare with the model's optimum.

- **Dashboard:** https://batting-order-lab.vercel.app (static site, English/Español, interactive simulator)
- **Paper:** [`research/paper.pdf`](research/paper.pdf) (source: [`research/paper.tex`](research/paper.tex))
- **Design decisions, protocol and operations:** [`docs/`](docs/)

## Results at a glance

All numbers come from `outputs/*.json` (test seasons 2025–2026; hyperparameters tuned on 2024 only;
see [`docs/methodology/validation-protocol.md`](docs/methodology/validation-protocol.md)).

| Question | Answer (model-based) |
|---|---|
| Are run predictions calibrated? | Yes: 9,860 team-games, mean error −0.035 runs (95% CI −0.096 to +0.026), calibration slope 0.94 (0.81–1.06) |
| How far are MLB managers' orders from the model optimum? | +0.020 runs/game (≈3.2 runs per 162 games); the median order used beats 97.8% of all 362,880 orders |
| How much can the order matter at all? | Best vs worst possible order of the same nine hitters: 0.094 runs/game on average |
| Is "the" optimal order identifiable? | No: under parameter uncertainty the exact same order is optimal in only 0.5% of re-estimates |
| Can the best order be certified? | Yes, within the model: all 362,880 orders are evaluated exactly in about 1.4 s, with a proven bound on numerical error |
| 2026 World Series Game 5 | Gain of the model's top order: Milwaukee +0.010 (90% interval −0.002 to +0.021), Tampa Bay +0.024 (+0.009 to +0.041); both orders used were above the 97th percentile |

These are counterfactual statements about the model, not observed effects: a real game shows only the
runs scored with the order that was used.

## What problem does it solve, and why does it matter?

A manager chooses the order in which nine hitters bat. Hitters near the top bat more often, so
the order decides who gets the extra plate appearances and with whom on base. The question has
been studied with Markov chains and simulation since the 1960s; the consensus is that the order
matters, but modestly. This project answers it rigorously for real games, separating what the
data show from what only the model can say.

**Objective.** For a fixed pregame order π, maximize V(π) = E[runs in 9 innings | π, information
before first pitch]. Not win probability (close to a coin flip for a single game).

**What it does not claim.** A real game reveals only the runs scored with the order actually
used. Every comparison between orders is a model-based counterfactual, never an observed effect.

## How it works

```
Statcast (Baseball Savant) + MLB Stats API
        │  batting-order ingest / build        (immutable raw data, SHA-256 manifest)
        ▼
plate appearances with base-out state, runs, censoring, bookkeeping checks
        │
        ├─ transition kernel J_c(s → s', runs)   estimated per outcome class (2023+ rules)
        └─ empirical-Bayes PA model              π(c | batter, pitcher) ∝ q_h(c)·m_b(c)·m_p(c)
                                                   (shrinkage; only data before the game)
        ▼
exact evaluator: half-innings as absorbing Markov chains → leadoff-slot chain across innings
        │  E[R_9] in ~1 ms; error ≤ 162·ε/q (proved, tested)
        ▼
exhaustive search over 9! orders (rotation trick, ~1.4 s)  →  certified optimum within the model
        │
        ├─ outputs/*.json → paper (research/)
        └─ web/public/data/*.json → static dashboard; the browser re-runs the same exact evaluator
```

| Component | Path |
|---|---|
| Data download / PA transitions / StatsAPI | `src/batting_order/data/` |
| PA model, kernel, matchup | `src/batting_order/model/` |
| Exact evaluator, Monte Carlo check, run expectancy | `src/batting_order/engine/` |
| Exhaustive search | `src/batting_order/optimize/` |
| Validation analyses | `src/batting_order/evaluate/` |
| Dashboard (Vite + React + TypeScript) | `web/` |
| Paper | `research/` |

## Data

Pitch-level **Statcast** data from Baseball Savant (2021–2026, regular season and postseason) and
official lineups, venues and names from the **MLB Stats API**. Both are © MLB Advanced Media and
are used here for non-commercial research. Bulk data are **not** stored in this repository: they
are downloaded on demand and verified against checksums. The site shows only names, lineups, final
scores and model-derived numbers.

## Run it

Requirements: Python 3.11–3.13, Node ≥ 22.12, a LaTeX distribution for the paper.

```bash
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[compare,figures,dev]"

pytest -m "not slow" && pytest -m slow                # Python tests
batting-order ingest 2021 2022 2023 2024 2025 2026    # ~2 h, resumable
batting-order verify 2021 2022 2023 2024 2025 2026    # compare with data_manifest/ checksums
batting-order build  2021 2022 2023 2024 2025 2026
batting-order experiments                             # ~3 h → outputs/*.json
batting-order snapshot 849805 --season 2026           # dashboard data for another game
python scripts/make_paper_assets.py --release         # figures, tables, validation.json, PDF copy
(cd research && pdflatex paper && bibtex paper && pdflatex paper && pdflatex paper)

batting-order home                                    # Home page data (official hitting lines)
(cd web && npm ci && npm run dev)                     # dashboard at http://localhost:5173
(cd web && npx vitest run && npx playwright test)     # unit + end-to-end tests
```

Updating for a new season and deploying are described in [`docs/operations.md`](docs/operations.md).

## Limitations

- Model-based counterfactuals only; the effect of an order cannot be observed in one game.
- Base running is league-average (no runner speed); pitching changes are modelled between
  innings; platoon effects are league-level; in-game substitutions are out of scope.
- Parameter uncertainty covers player abilities only, not the kernel or model form.
- Inferred lineups in backtests (audited 60/60 against official boxscores; reference game uses
  the official boxscore).

## License

Code: MIT (see `LICENSE`). Data: © MLB Advanced Media, not redistributed.
