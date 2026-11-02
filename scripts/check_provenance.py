"""Re-compute a random sample of published results with the current code and compare.

Checks (all must agree to 1e-9):
  * 25 random team-games of the E3/E4b table (work/games_2025.parquet, work/games_2026.parquet);
  * the reference game's point estimates in web/public/data/games/849799.json.

    python scripts/check_provenance.py          # writes outputs/provenance_check.json
"""

from __future__ import annotations

import json
from datetime import date

import numpy as np
import polars as pl

from batting_order.config import REFERENCE_GAME, project_root, tuned_hyper
from batting_order.data.build import load_lineups, load_transitions
from batting_order.data.statsapi import StatsApi, official_lineups
from batting_order.engine.markov import evaluate, exhaustive
from batting_order.evaluate.games import run_games
from batting_order.model.kernel import kernel_for
from batting_order.model.matchup import GameContext, build_matchup
from batting_order.model.pa_model import build_snapshot
from batting_order.snapshot import git_revision

COLS = ["pred_r8", "pred_r9_actual", "pred_r9_opt", "pred_r9_book", "pct_actual"]


def main() -> None:
    root = project_root()
    data = root / "data"
    hyper, _ = tuned_hyper(root)
    seasons = [2022, 2023, 2024, 2025, 2026]
    pa = load_transitions(data, seasons)
    lineups = load_lineups(data, seasons)
    stored = pl.concat(
        [pl.read_parquet(root / "work" / f"games_{s}.parquet") for s in (2025, 2026)]
    )
    sample = stored.sample(25, seed=99)
    max_dev = 0.0
    for r in sample.iter_rows(named=True):
        lu = lineups.filter(
            (pl.col("game_pk") == r["game_pk"]) & (pl.col("bat_team") == r["bat_team"])
        )
        d = r["game_date"]
        out = run_games(pa, lu, d, date.fromordinal(d.toordinal() + 1), hyper)
        new = out.row(0, named=True)
        max_dev = max(max_dev, *(abs(new[c] - r[c]) for c in COLS))
    # Reference game point estimates.
    snap_file = json.loads(
        (root / "web" / "public" / "data" / "games" / f"{REFERENCE_GAME}.json").read_text(
            encoding="utf-8"
        )
    )
    api = StatsApi(data / "raw" / "statsapi")
    lus = official_lineups(api.boxscore(REFERENCE_GAME))
    gd = date(2026, 10, 28)
    snap = build_snapshot(pa, gd, hyper)
    kernel = kernel_for(pa, gd, {})
    ref_dev = 0.0
    for side, other in (("away", "home"), ("home", "away")):
        t = snap_file["teams"][side]
        ctx = GameContext(
            [h.player_id for h in lus[side].starters],
            lus[other].starting_pitcher_id,
            t["opponent_starter"]["throws"],
            lus[other].abbreviation,
        )
        m = build_matchup(snap, ctx)
        ex = exhaustive(kernel, m)
        _, opt = ex.best()
        act = evaluate(kernel, m, np.arange(9)).expected_runs
        ref_dev = max(ref_dev, abs(act - t["actual"]["er9"]), abs(opt - t["optimal"]["er9"]))
    res = {
        "git": git_revision(root),
        "sample_team_games": sample.height,
        "max_abs_deviation_games": max_dev,
        "max_abs_deviation_reference": ref_dev,
        "passed": bool(max_dev < 1e-9 and ref_dev < 1e-9),
    }
    (root / "outputs" / "provenance_check.json").write_text(json.dumps(res, indent=1))
    print(res)
    if not res["passed"]:
        raise SystemExit("provenance check failed")


if __name__ == "__main__":
    main()
