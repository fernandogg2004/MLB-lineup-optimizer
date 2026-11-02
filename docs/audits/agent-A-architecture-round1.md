# Agent A — Repository architecture and maintainability audit, round 1

- Date: 2026-11-02 · Target: branch `rebuild/v2` at `8bbf0a7`
- Auditor: independent general-purpose agent with the `auditor-architecture` definition inlined.
  Read-only (working tree clean at the end). Ran ruff, strict mypy, fast pytest, `tsc -b`, oxlint,
  `npm ls`; reproduced A-1 with a non-editable install into a scratch target.

Verified sound: tooling green; tests need no local data; structure matches docs; Airflow optional
and disabled (but non-functional, see A-1/A-12); no secrets in HEAD or baseline history; build
artifacts ignored; CI YAML steps correct for a clean runner (never executed, A-7).

| ID | Severity | Location | Finding | Blocks release? | Confidence |
|---|---|---|---|---|---|
| A-1 | High | `cli.py:30-32`, `evaluate/run.py:57`, `season-update.yml:64`, `Dockerfile.pipeline:9` | Project root derived from the installed package path; with non-editable installs (workflow, Airflow image) data/snapshots are written outside the checkout → workflow reports "No new snapshots" and succeeds; DAG writes into a removed container | Yes (season update) | High (reproduced) |
| A-2 | High | `cli.py:62-80`, `snapshot.py:196`, `README.md:89` | `snapshot`/`update` use default hyperparameters (1.0/1.5), not the tuned ones (0.5/0.75) used for the reference game and paper; the README command would overwrite the reference snapshot with a different model | Yes | High |
| A-3 | Medium | `make_paper_assets.py:324` | Literal TAB in `r"<TAB>extbf{??}"`: shipped PDF shows "extbf??"; also prints `2.0.0@unknown` | Yes (paper) | High |
| A-4 | Medium | `snapshot.py:49-55`, `outputs/*.json` | Provenance unreliable: several outputs record git `unknown`, others a commit that predates code changes; dirty trees not flagged | No | High |
| A-5 | Medium | `statcast.py`, README, operations | "Verified against checksums" is false: manifest is rewritten on every download, not committed, never compared | No | High |
| A-6 | Medium | `season-update.yml` | PRs created with `GITHUB_TOKEN` do not trigger CI; requires repo setting; inputs interpolated into shell | No (Yes for update process) | High |
| A-7 | Medium | git refs | `rebuild/v2` never pushed (CI never ran on a clean runner); remote `main` is at `96a16e1`, unknown locally | Yes (merge) | High |
| A-8 | Low | `pyproject.toml`, `ci.yml` | Unused declared deps (pybaseball, pandas, pyarrow); no lock file; CI tests 3.11 only | No | High |
| A-9 | Low | README, `web/package.json` | "Node 20+" wrong (vitest 5 needs ≥22.12); chained `cd` bug in run block; placeholders | No (placeholders: yes) | High |
| A-10 | Low | `run.py`, legacy script, README | E2b reproduction prerequisites undocumented; silently skipped | No | High |
| A-11 | Low | several | Dead code (`_label`, redundant sort, identity map, `TeamResult`, `GameRow`, `class_names`, `exhaustive_search`), stale docstring, unused marker, layering (`snapshot` imports from `evaluate`) | No | High |
| A-12 | Low | `orchestration/airflow` | No `.dockerignore` (1.1 GB context incl. legacy `.env`); DAG never executed; socket permissions | No | Medium |
| A-13 | Low | PDFs | Paper PDF tracked twice with no sync; no staleness check for generated files | No | High |
| A-14 | Low | tests | No tests for CLI, `write_index`, `build_game_snapshot`, StatsAPI | No | High |
| A-15 | Info | `.env`, `web/.env.local` | Legacy credentials (names only inspected) on disk; untracked/ignored; recommend rotation and `.env*` in `.vercelignore` | No | High |
| A-16 | Info | `operations.md:51` | CLI uploads working directory, not "committed sources" | No | High |
| A-17 | Info | history | No bulk data added on branch; baseline LFS pointers retained per ADR 0001 | No | High |

Details, evidence and proposed verifications are preserved in the session transcript summary and
summarised per finding in `docs/audits/findings-register.md`.
