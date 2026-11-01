"""Game-level experiments E3 (run calibration) and E4b (actual vs optimal orders).

For each team-game with a reliable inferred starting lineup the model is fitted on
data strictly before the game date. The actual order is evaluated exactly, all
9! orders are evaluated exhaustively, and the observed runs of innings 1-8 are
attached for calibration. Snapshots are cached per date and kernels per month.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import polars as pl

from batting_order.engine.markov import evaluate, exhaustive
from batting_order.engine.run_expectancy import run_values
from batting_order.engine.states import Kernel
from batting_order.model.kernel import fit_kernel
from batting_order.model.matchup import GameContext, build_matchup
from batting_order.model.pa_model import Hyper, Snapshot, build_snapshot
from batting_order.optimize.search import batter_summaries, heuristic_sorted, heuristic_the_book

log = logging.getLogger(__name__)
KERNEL_YEARS = 3
KERNEL_ERA_START = date(2023, 1, 1)  # 2023 rule changes (bases, pick-off limits, shift ban)


def kernel_for(pa: pl.DataFrame, d: date, cache: dict[date, Kernel]) -> Kernel:
    """Kernel fitted on the window ending at the first day of ``d``'s month."""
    key = date(d.year, d.month, 1)
    if key not in cache:
        start = max(KERNEL_ERA_START, key - timedelta(days=365 * KERNEL_YEARS))
        if start >= key:  # early 2023: fall back to the previous era rather than nothing
            start = key - timedelta(days=365)
        cache[key] = fit_kernel(pa, key, start)
    return cache[key]


def observed_runs_8(pa: pl.DataFrame) -> pl.DataFrame:
    """Runs scored in innings 1-8 by each (game, batting team)."""
    return (
        pa.filter(pl.col("inning") <= 8)
        .group_by(["game_pk", "bat_team"])
        .agg(pl.col("runs").sum().alias("runs_8"))
    )


@dataclass
class GameRow:
    game_pk: int
    game_date: date
    game_type: str
    bat_team: str
    fld_team: str
    pred_r8: float
    pred_r9_actual: float
    pred_r9_opt: float
    pred_r9_book: float
    pred_r9_rv_sorted: float
    pred_r9_obp_sorted: float
    pred_r9_random_mean: float
    pred_r9_worst: float
    pct_actual: float
    opt_order: list[int]


def run_games(
    pa: pl.DataFrame,
    lineups: pl.DataFrame,
    start: date,
    end: date,
    hyper: Hyper,
    max_games: int | None = None,
    seed: int = 0,
) -> pl.DataFrame:
    games = lineups.filter(
        pl.col("reliable") & (pl.col("game_date") >= start) & (pl.col("game_date") < end)
    ).sort(["game_date", "game_pk"])
    if max_games is not None and games.height > max_games:
        games = games.sample(max_games, seed=seed).sort(["game_date", "game_pk"])
    obs = observed_runs_8(pa)
    snaps: dict[date, Snapshot] = {}
    kernels: dict[date, Kernel] = {}
    rows: list[dict[str, object]] = []
    t0 = time.time()
    for i, g in enumerate(games.iter_rows(named=True)):
        d = g["game_date"]
        if d not in snaps:
            snaps.clear()  # one date at a time keeps memory flat
            snaps[d] = build_snapshot(pa, d, hyper)
        snap = snaps[d]
        kernel = kernel_for(pa, d, kernels)
        ctx = GameContext(
            list(g["lineup"]), g["opp_starter"], g["opp_starter_throws"], g["fld_team"]
        )
        m = build_matchup(snap, ctx)
        ident = np.arange(9)
        ev = evaluate(kernel, m, ident)
        ex = exhaustive(kernel, m)
        vals = ex.values.ravel()
        opt_order, opt_val = ex.best()
        rv = run_values(kernel, m.x[0].mean(axis=0))
        summ = batter_summaries(m, rv)
        rows.append(
            {
                "game_pk": g["game_pk"],
                "game_date": d,
                "game_type": g["game_type"],
                "bat_team": g["bat_team"],
                "fld_team": g["fld_team"],
                "pred_r8": float(ev.runs_by_inning[:8].sum()),
                "pred_r9_actual": ev.expected_runs,
                "pred_r9_opt": opt_val,
                "pred_r9_book": ex.value_of(heuristic_the_book(summ)),
                "pred_r9_rv_sorted": ex.value_of(heuristic_sorted(summ["rv"])),
                "pred_r9_obp_sorted": ex.value_of(heuristic_sorted(summ["obp"])),
                "pred_r9_random_mean": float(vals.mean()),
                "pred_r9_worst": float(vals.min()),
                "pct_actual": float((vals < ev.expected_runs).mean()),
                "opt_order": [int(v) for v in opt_order],
                "truncated_mass": max(ev.truncated_mass, ex.truncated_mass),
            }
        )
        if (i + 1) % 200 == 0:
            log.info("%d/%d games (%.0fs)", i + 1, games.height, time.time() - t0)
    out = pl.DataFrame(rows).join(obs, on=["game_pk", "bat_team"], how="left")
    return out
