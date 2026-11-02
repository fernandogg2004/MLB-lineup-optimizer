# ADR 0001 — Rebuild scope and user decisions

- Status: accepted
- Date: 2026-11-01
- Baseline: commit `a2f6a22` (tag `baseline/pre-rebuild`), parent `d2ea993` on `main`

## Context

Phase 0 discovery found a sprawling system (~31k lines of Python) whose core
(plate-appearance model → Monte Carlo simulator → genetic optimizer) is surrounded
by unrelated subsystems (betting EV/CLV, GTM docs, RAG/LLM, AWS catalog, crisis
detector, MLflow, two parallel FastAPI services). Local 2026 data ended on
2026-06-11, so the reference game (2026 World Series Game 5, gamePk 849799,
MIL 4 @ TB 1, 2026-10-28, verified against MLB StatsAPI) could not be analyzed.

## Decisions taken by the user

1. **Pruning: core only.** Keep data → PA model → exact evaluator → optimizer →
   backtest → dashboard → optional Airflow. Remove betting/economic layer, GTM
   docs, RAG/LLM, AWS/catalog/weather lambda, crisis detector, MLflow tooling,
   both FastAPI services and the CV (`main.tex`) from HEAD. Git history retains them.
2. **Bulk MLB data: stop versioning.** Raw/silver Statcast data are gitignored and
   regenerated with a reproducible download script plus a checksum manifest. Local
   copies are not modified. The repo ships only small derived snapshots. No history
   rewrite or force-push.
3. **Future seasons: manual GitHub Action.** A `workflow_dispatch`-only workflow
   (no cron) runs the same idempotent CLI command available locally; it commits
   new snapshots. Airflow wraps the same command and is disabled by default.
4. **Vercel: CLI deploy.** A new Hobby project; the user authenticates with
   `npx vercel login`; deploys are deliberate and from tested builds.

## Defaults adopted (stated to the user, not objected to)

- Code, documentation and paper in English; dashboard bilingual (ES/EN).
- Primary objective: expected runs over 9 offensive innings for a fixed pregame
  batting order, information cutoff = first pitch. Win probability is not a
  headline quantity (prior diagnostics show it is ≈ coin-flip at game level).
- An exact Markov-chain evaluator becomes the source of truth for E[R]; Monte Carlo
  is retained as an independent cross-check only.
- PA model selected by evidence: a parsimonious empirical-Bayes/log5 model versus
  the existing LightGBM, under rolling-origin point-in-time evaluation.
- Static SPA on Vercel with precomputed versioned JSON and in-browser exact
  evaluation (Web Worker); no serverless Python, database or paid service.
- Work on branch `rebuild/v2`; merge to `main` only after validation.
