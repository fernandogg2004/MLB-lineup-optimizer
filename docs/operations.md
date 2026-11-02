# Operations: updating data and deploying

Everything runs on free tiers: Baseball Savant and MLB Stats API (public, non-commercial use),
GitHub Actions (public repository), Vercel Hobby (static hosting). Nothing requires a paid service,
a database, or a server.

## Architecture

```
Baseball Savant (Statcast) ─┐                          ┌─ outputs/*.json ── paper (research/)
MLB Stats API ──────────────┼─ batting-order CLI ──────┤
                            │  (ingest → build →       └─ web/public/data/*.json
                            │   model → exact search)          │
                            │                                   ▼
                            │                      static site (Vite) on Vercel
                            │                      exact evaluator runs in the browser
```

The dashboard is a static site. All model fitting happens offline; the browser only evaluates
lineups with the exact Markov evaluator (TypeScript port, parity-tested against Python).

## Season update (new games)

Locally:

```bash
batting-order update --season 2027            # postseason games only (default)
batting-order update --season 2027 --last 30  # or the last 30 completed games
cd web && npm run build && npx playwright test  # verify
```

Or from GitHub: **Actions → "Season update (manual)" → Run workflow**. It never runs on a
schedule; it downloads the data, writes snapshots, runs the Python and web test suites and opens a
pull request. It requires *Settings → Actions → General → Allow GitHub Actions to create and
approve pull requests*. Pull requests opened by the built-in token do not trigger CI, which is why
the tests run inside the workflow.

Paths are resolved from `$BATTING_ORDER_ROOT` or the current directory, so commands must run
inside the checkout. `update` needs the three previous seasons processed locally (the workflow
does this itself):

```bash
batting-order ingest 2024 2025 2026 && batting-order build 2024 2025 2026
```

The reference game (2026 World Series Game 5, gamePk 849799) is never overwritten by `update`:
existing snapshots are skipped.

## Deploying to Vercel (Hobby)

The Vercel project `batting-order-lab` was created with the Vercel CLI. Note that the CLI uploads
the **working directory** of `web/` (not a Git commit), so deploy from a clean checkout of a commit
that passed CI:

```bash
git status --porcelain web | grep -q . && echo "uncommitted changes in web/ — aborting" && exit 1
cd web
npx vercel login            # once, interactive
npx vercel link             # once; links web/ to the existing project
npx vercel deploy --prod    # Vercel builds the uploaded sources (npm ci && npm run build)
E2E_BASE_URL=https://batting-order-lab.vercel.app npx playwright test
```

A brand-new Vercel project assigns its first deployment to production even without `--prod`.

## Optional automation

`orchestration/airflow/` contains a disabled-by-default DAG that runs `batting-order update`
on a schedule you choose. It does not commit or deploy. See its README.

## Data rights

Statcast and Stats API data are © MLB Advanced Media and are used here for non-commercial research.
Bulk data are not redistributed in this repository: they are downloaded on demand, and
`batting-order verify <seasons>` compares them with the SHA-256 checksums published in
`data_manifest/` (Savant occasionally revises recent games, so a mismatch is reported, not fixed); the site shows player names, lineups, final scores and model-derived
numbers only.

## Reproducing the legacy comparison (experiment E2b)

E2b scores the original project's model on its own stored features. It needs the baseline commit
and its Git LFS artifacts, so it is optional and is skipped (with a warning) when its input is absent:

```bash
GIT_LFS_SKIP_SMUDGE=0 git worktree add ../mlb-baseline-wt baseline/pre-rebuild
# in an environment with the original requirements (see that worktree's README):
python scripts/legacy_pa_predictions.py ../mlb-baseline-wt     ../mlb-baseline-wt/data/gold/features_train_v3.parquet     ../mlb-baseline-wt/models/at_bat_predictor.pkl work/legacy_2026.parquet
batting-order experiments --only e2b
```
