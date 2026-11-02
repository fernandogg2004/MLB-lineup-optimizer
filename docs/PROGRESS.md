# Progress record

Status as of 2026-11-03: **complete**. Rebuild merged into `main` (PR #2, merge `d5f51ff`); original
system at tag `baseline/pre-rebuild`.

| Phase | Status | Evidence |
|---|---|---|
| 0 Discovery & questions | done | `docs/decisions/0001-rebuild-scope-and-decisions.md` |
| 1 Baseline | done | `docs/audits/00-baseline-report.md` |
| 2 Methodology | done | `docs/methodology/experimental-protocol.md` (+ amendments 1–2) |
| 3 Reconstruction | done | `src/batting_order`, tests, CI, optional Airflow |
| 4 Experiments | done | `outputs/*.json`; `docs/audits/provenance.md`; `outputs/provenance_check.json` |
| 5 Paper | done | `research/paper.tex`, `research/paper.pdf` (cites `33ad5e4`) |
| 6 Dashboard | done | https://batting-order-lab.vercel.app (5 World Series games, EN/ES) |
| 7 Deploy & merge | done | Vercel project `batting-order-lab` (deployed `ebe83c0`, e2e 16/16 live); CI green |
| 8 Four-agent audit | done (round 1 + round-2 verification) | `docs/audits/agent-{A,B,C,D}-*-round1.md`, `findings-register.md` |
| 9 Handover | done | README, `docs/operations.md`, `orchestration/airflow/README.md` |

## Open items (owner decisions, not blockers)
- Rotate the legacy credentials in the untracked root `.env` of the original system (not used).
- Confirm the MIT license choice.
- Deferred: Python lock file (A-8); aligning heuristic run values across E4a/E4b (B-8);
  executing the Airflow DAG on Docker (Docker was not available).
