# Progress record (rebuild/v2)

Working branch: `rebuild/v2` (baseline tag `baseline/pre-rebuild`). Update at milestones.

| Phase | Status | Evidence |
|---|---|---|
| 0 Discovery & questions | done | ADR 0001 (user decisions) |
| 1 Baseline | done | `docs/audits/00-baseline-report.md` |
| 2 Methodology | done | `docs/methodology/experimental-protocol.md`, paper §2–5 |
| 3 Reconstruction | done | package `src/batting_order`, tests, CI, Airflow isolated |
| 4 Experiments | running | `batting-order experiments` → `outputs/` |
| 5 Paper | theory drafted; results pending | `research/paper.tex` |
| 6 Dashboard | built; e2e 12/12 | `web/`, `web/e2e/app.spec.ts` |
| 7 Deploy & merge | pending (needs `npx vercel login` by the user) | |
| 8 Four-agent audit | pending | `docs/audits/` |
| 9 Handover | pending | |

## Findings so far (quick runs, to be confirmed by full experiments)
- Run expectancy from the estimated kernel matches observed RE at inning start within 0.01;
  larger gaps in runner-on-third states are explained by selection (more offensive outcome mix
  observed there), not by the kernel (immediate runs per transition match the data).
- Monte Carlo genetic search (original method) overstates its chosen order by ~0.17 runs and
  lands farther from the optimum than the managers' own orders; exact exhaustive search takes
  ~0.6 s.
- Data quirks fixed: Savant window grid could duplicate rows; boxscore `battingOrder` lists
  end-of-game players; non-deterministic float sums in polars group-by.

## Next steps
1. Full experiments → `scripts/make_paper_assets.py` → results text, abstract, conclusions.
2. Reference snapshot (400 draws) + 2026 postseason snapshots → web data.
3. README, paper PDF, commit; deploy after user login; four-agent audit and remediation.
