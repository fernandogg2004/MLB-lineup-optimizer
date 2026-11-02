# Progress record (rebuild/v2)

Working branch: `rebuild/v2` (baseline tag `baseline/pre-rebuild`). Update at milestones.

| Phase | Status | Evidence |
|---|---|---|
| 0 Discovery & questions | done | ADR 0001 (user decisions) |
| 1 Baseline | done | `docs/audits/00-baseline-report.md` |
| 2 Methodology | done | `docs/methodology/experimental-protocol.md`, paper §2–5 |
| 3 Reconstruction | done | package `src/batting_order`, tests, CI, Airflow isolated |
| 4 Experiments | done except E2 rerun (deterministic LightGBM) + E2c | `outputs/*.json` |
| 5 Paper | compiles (17 pp); E2c macros pending (`??`) | `research/paper.pdf` |
| 6 Dashboard | reference game final; e2e 12/12; WS game picker pending | `web/` |
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

## Blocked on the user
- Approval to run remaining heavy jobs (memory guard stopped the background shell once).
- `npx vercel login` for deployment.

## Next steps
1. Full experiments → `scripts/make_paper_assets.py` → results text, abstract, conclusions.
2. Reference snapshot (400 draws) + 2026 postseason snapshots → web data.
3. README, paper PDF, commit; deploy after user login; four-agent audit and remediation.
