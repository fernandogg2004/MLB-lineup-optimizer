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
schedule; it downloads the data, writes snapshots and opens a pull request. Review and merge it.

`update` needs the three previous seasons processed locally (the workflow does this itself):

```bash
batting-order ingest 2024 2025 2026 && batting-order build 2024 2025 2026
```

The reference game (2026 World Series Game 5, gamePk 849799) is never overwritten by `update`:
existing snapshots are skipped.

## Deploying to Vercel (Hobby)

The project was created with the Vercel CLI. From `web/`:

```bash
npx vercel login            # once, interactive
npx vercel link             # once; links web/ to the existing project
npx vercel deploy --prod    # builds on Vercel from the committed sources
```

Deploy only from a commit that passed CI. Check the result with
`E2E_BASE_URL=https://<production-url> npx playwright test`.

## Optional automation

`orchestration/airflow/` contains a disabled-by-default DAG that runs `batting-order update`
on a schedule you choose. It does not commit or deploy. See its README.

## Data rights

Statcast and Stats API data are © MLB Advanced Media and are used here for non-commercial research.
Bulk data are not redistributed in this repository (they are downloaded on demand and verified with
`MANIFEST.json` checksums); the site shows player names, lineups, final scores and model-derived
numbers only.
