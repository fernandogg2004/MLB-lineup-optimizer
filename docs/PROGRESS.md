# Progress record (rebuild/v2)

Working branch: `rebuild/v2` (baseline tag `baseline/pre-rebuild`). Update at milestones.

| Phase | Status | Evidence |
|---|---|---|
| 0 Discovery & questions | done | ADR 0001 |
| 1 Baseline | done | `docs/audits/00-baseline-report.md` |
| 2 Methodology | done | protocol + amendment 1 |
| 3 Reconstruction | done | `src/batting_order`, CI, Airflow isolated |
| 4 Experiments | done | `outputs/*.json`; reproducibility check `outputs/provenance_check.json` (0.0 deviation at `07d570c`) |
| 5 Paper | done, pending Agent D review | `research/paper.pdf` (cites `07d570c`) |
| 6 Dashboard | done; 5 World Series games; e2e 15/15 on production | `web/` |
| 7 Deploy & merge | deployed `af9a16a` to https://batting-order-lab.vercel.app (verified); merge to `main` pending audits | |
| 8 Four-agent audit | A and C round 1 done and remediated; B and D running | `docs/audits/` |
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
