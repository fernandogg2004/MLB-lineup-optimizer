# Batting Order Lab

**How much does the batting order matter?** This project computes, exactly, the expected runs
of any MLB batting order under a statistically estimated model, finds the best order by checking
all 362,880 of them, and shows, in English and Spanish, how the two lineups of the
**2026 World Series Game 5** (Milwaukee 4, Tampa Bay 1) compare with the model's optimum.

- **Dashboard:** <!--DEPLOY_URL--> (static site, bilingual, interactive simulator)
- **Paper:** [`research/paper.pdf`](research/paper.pdf) (source: [`research/paper.tex`](research/paper.tex))
- **Decisions and audits:** [`docs/`](docs/)

<!--RESULTS-->

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
exhaustive search over 9! orders (rotation trick, ~0.6 s)  →  certified optimum within the model
        │
        ├─ outputs/*.json → paper (research/)
        └─ web/public/data/*.json → static dashboard; the browser re-runs the same exact evaluator
```

| Component | Path |
|---|---|
| Data download / PA transitions / StatsAPI | `src/batting_order/data/` |
| PA model, kernel, matchup | `src/batting_order/model/` |
| Exact evaluator, Monte Carlo check, run expectancy | `src/batting_order/engine/` |
| Search methods (exhaustive, local search, annealing, GA, heuristics) | `src/batting_order/optimize/` |
| Experiments E1–E5 | `src/batting_order/evaluate/` |
| Dashboard (Vite + React + TypeScript) | `web/` |
| Paper | `research/` |
| Optional Airflow (disabled by default) | `orchestration/airflow/` |

## Data

Pitch-level **Statcast** data from Baseball Savant (2021–2026, regular season and postseason) and
official lineups, venues and names from the **MLB Stats API**. Both are © MLB Advanced Media and
are used here for non-commercial research. Bulk data are **not** stored in this repository: they
are downloaded on demand and verified against checksums. The site shows only names, lineups, final
scores and model-derived numbers.

## Methods compared

Plate-appearance models: league average, + batter, + pitcher (selected, empirical Bayes),
gradient boosting on the same inputs, and the original project's 51-feature LightGBM.
Search methods: exhaustive (exact), "The Book" guideline, sorting heuristics, local search,
simulated annealing, a genetic algorithm with exact fitness, and the original genetic algorithm
with Monte Carlo fitness. Exhaustive search is used because it is both exact and fast; the
others are kept as documented baselines.

## Run it

Requirements: Python 3.11–3.13, Node 20+. A LaTeX distribution for the paper.

```bash
python -m venv .venv && . .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -e ".[ingest,compare,figures,dev]"

pytest -m "not slow" && pytest -m slow                # Python tests
batting-order ingest 2021 2022 2023 2024 2025 2026    # ~2 h, resumable
batting-order build  2021 2022 2023 2024 2025 2026
batting-order experiments                             # ~3 h → outputs/*.json
batting-order snapshot 849799 --season 2026           # dashboard data for a game
python scripts/make_paper_assets.py                   # figures, tables, validation.json
cd research && latexmk -pdf paper.tex

cd web && npm ci && npm run dev                       # dashboard at http://localhost:5173
npx vitest run && npx playwright test                 # unit + end-to-end tests
```

Updating for a new season, deploying, and the optional Airflow DAG are described in
[`docs/operations.md`](docs/operations.md) and
[`orchestration/airflow/README.md`](orchestration/airflow/README.md).

## Limitations

- Model-based counterfactuals only; the effect of an order cannot be observed in one game.
- Base running is league-average (no runner speed); pitching changes are modelled between
  innings; platoon effects are league-level; in-game substitutions are out of scope.
- Parameter uncertainty covers player abilities only, not the kernel or model form.
- Inferred lineups in backtests (audited 60/60 against official boxscores; reference game uses
  the official boxscore).

## License

Code: MIT (see `LICENSE`). Data: © MLB Advanced Media, not redistributed.
