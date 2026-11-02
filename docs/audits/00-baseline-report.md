# Baseline report (Phase 1)

- Date: 2026-11-01
- Baseline commit: `a2f6a22` (tag `baseline/pre-rebuild`); previous `main` head `d2ea993`.
- Recover the original system with `git checkout baseline/pre-rebuild`.

## Environment

| Item | Status |
|---|---|
| Python 3.11.9 venv (`.venv`, pre-existing) | works |
| Node 24.15, npm | available |
| GitHub CLI | authenticated (`fernandogg2004`); repo public; `main` unprotected; no CI |
| MiKTeX `pdflatex` / `latexmk` | available |
| Codex CLI | available |
| Vercel CLI | **not installed / not authenticated** |
| Docker | **not installed** (Airflow stack cannot be started locally) |
| Secrets | `.env` present locally (gitignored, not read). Optional keys referenced by old code: `ANTHROPIC_API_KEY`, `GROQ_API_KEY`, `OPENAI_*`, AWS, Tomorrow.io. |

## Test suite

`pytest` (pre-existing `.venv`): **242 passed, 5 skipped, 18 warnings in 23 s**. No frontend
unit tests; one Playwright spec (`frontend/e2e_data_consistency.spec.ts`) requiring a running
backend (not executed).

## Execution paths (as documented in the old README)

| Path | Verified? | Notes |
|---|---|---|
| `build_silver.py` → `scripts/build_gold_v3.py` → `train_v3.py` | not re-run | Needs ~1 h and pybaseball; outputs present in LFS. |
| `predict_tonight.py` (daily CLI) | not re-run | Depends on live MLB StatsAPI schedule; the season is over. |
| `api/main.py` + `frontend/` | not re-run | FastAPI + Vite SPA; optional Postgres/LLM integrations. |
| Airflow (`docker-compose.airflow.yml`) | cannot run | Docker absent. |

## Data inventory (local, unchanged)

| Dataset | Coverage | Notes |
|---|---|---|
| `data/silver/plate_appearances/season=2015..2026` | 2015-03 → **2026-06-11** | PA-level, 19 columns, **no base-out state**; 2026 incomplete. |
| `data/raw/statcast_2021..2024.parquet` | 2021–2024 | 10 columns only (not pitch-level raw). |
| `data/gold/features_train{,_v2,_v3}.parquet` | 2015–2026-06 | 39 + 124 + 128 MB derived features; v1/v2 obsolete. |
| `models/at_bat_predictor.pkl` (= `pa_predictor_v1.pkl`) | — | LightGBM, 8 classes. |
| `results/<date>/<TEAM>.json` | 2026-05-19 → 2026-06-23 | 444 saved daily predictions. |

SHA-256 of preserved artifacts:

```
53ef923fef94ecacb563949c852e9bb91c52c7eacbb25dfb7ede84a0686240ed models/at_bat_predictor.pkl
04dfa79ea32ef13998d219ccd552ef73c8e3205adc4426d8284ea75e6852c38f models/at_bat_predictor_v3_backup_2026-05-28.pkl
22a18ac93e8569654f9ff4737afa976341ab54dcbaeea05a174043f5cc5b3801 silver season=2015
aa68d8204e7f19312978a3d48237509b4a5838d658f6e822f9ea9a440adb9005 silver season=2016
9704061b4cf9e3a909833a3da98fc1231db9291d60fbb16ffbae6fc326a77f4a silver season=2017
ed78626d24d9e3b9768d9b2eb1f201ef165115c6669eeaffb348a188cd0d4dec silver season=2018
d02c8e561ae8687191e9088a330d7ea550aba0e1a68e8e83e82805d68555fe48 silver season=2019
b88c919d676b8e6c7191c227a9b0dd10a1c44c1947b0b285119d1b90398727ce silver season=2020
127999d8222784658636bd1fd44ed44b3648b9deb92f84f8877e5178bbadf5fe silver season=2021
b2521649d2dd210164eb1a2ca1fda9490edb9c683d9d4c62ce9727f584b54e40 silver season=2022
721165f6395bea8d645cb10a68ccce81418c2400bbaad17c34ab940469c615b8 silver season=2023
d09085aa7387b960d33b382b65f83e075a34d7d93628dd6d7af72900827373b8 silver season=2024
c139cca0f6bb9df17c3db2852568b6b5a8ba87213e5b40fbd496e02d23f7d8d8 silver season=2025
bdfdd0a99d2e499e52cb05ec1483af327fb6ec1f297821b49ae7b8b8036753fc silver season=2026
```

## Previously reported metrics (to be re-examined, not re-asserted)

From `reports/diagnostics/lineup_backtest.json` (2026-06-24, n = 40 team-games):

- optimal (GA) vs saved order: +0.0525 runs/game (SE 0.012, 90% CI [0.033, 0.072]);
- optimal vs random: +0.103; saved vs random: +0.050 (saved order at 81st percentile);
- **only 5 % of GA winners were statistically distinguishable from the runner-up.**

Audit notes on this claim: (i) it is a model-based counterfactual, not an observed effect;
(ii) the GA winner is chosen as the maximum of Monte Carlo estimates and re-scored by the same
engine, so it is biased upward (winner's curse); (iii) `+8.5 runs/season` extrapolates a 40-game
sample. The rebuild replaces this with exact evaluation (no Monte Carlo selection noise).

Other previously reported diagnostics: PA model ECE 0.002 out-of-sample; game-level winner
prediction indistinguishable from 50/50 (AUC 0.538, log-loss 0.6986 with 0.693 inside its CI).

## Known defects found during discovery

1. 2026 data end on 2026-06-11 — reference game (2026-10-28) not covered.
2. No base-out state in silver → runner advancement assumed, never estimated or validated.
3. Errors and catcher's interference coded as outs; outs never advance runners; starter-only
   pitching; hard-coded park factors.
4. Statcast columns `*_days_until_next_game` contain future information (must never be used).
5. `boxscore.battingOrder` lists end-of-game players; starting lineup must be read from the
   `battingOrder` slot codes (`100, 200, …`), not the final list (TB slots 7–8 in Game 5).
