# ADR 0001 — Scope, data and objective

- Status: accepted
- Date: 2026-11-01

## Context

The project answers one question: how much does the batting order of nine fixed hitters change a
team's expected runs, and which order is best? It must be reproducible from public data, free to
run and host, and honest about what a single game can and cannot show. The reference case is the
2026 World Series Game 5 (gamePk 849799, Milwaukee 4 at Tampa Bay 1, 2026-10-28).

## Decisions

1. **Scope: the core pipeline only.** Data → plate-appearance model → exact evaluator → optimizer →
   backtests → dashboard and paper. Nothing else (betting, win probability products, servers) is part
   of the project.
2. **Bulk MLB data are not versioned.** Raw and processed Statcast data are gitignored and regenerated
   with a resumable download command plus published SHA-256 checksums (`data_manifest/`). Local raw
   files are never modified. The repository ships only small derived snapshots.
3. **New seasons by a manual GitHub Action.** A `workflow_dispatch`-only workflow (never scheduled)
   runs the same idempotent CLI command available locally and opens a pull request with the new
   snapshots.
4. **Static hosting on Vercel, deployed deliberately with the CLI** from tested builds.

## Defaults

- Code, documentation and paper in English; dashboard bilingual (English and Spanish).
- Objective: expected runs over nine offensive innings for a fixed pregame batting order, with the
  information cutoff at first pitch. Win probability is not modelled: at the level of one game it is
  close to a coin flip.
- The exact Markov-chain evaluator is the source of truth for expected runs; a Monte Carlo simulator
  is kept only as an independent cross-check.
- The plate-appearance model is chosen on evidence: a parsimonious empirical-Bayes (log5) model
  against richer alternatives, under rolling-origin evaluation with no future information.
- The dashboard is a static single-page app with precomputed JSON and exact evaluation in the
  browser (Web Worker); no serverless Python, database or paid service.
