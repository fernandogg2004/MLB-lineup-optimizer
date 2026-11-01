"""Versioned per-game snapshots consumed by the dashboard (``web/public/data``).

A snapshot contains everything needed to reproduce the dashboard numbers in the
browser: the kernel, both teams' matchup probabilities (posterior mean and
posterior draws), the official starting lineups and all precomputed results.
Everything is computed with information strictly before the game date.
"""

from __future__ import annotations

import json
import logging
import subprocess
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

from batting_order import __version__
from batting_order.data.statsapi import StatsApi, TeamLineup, official_lineups
from batting_order.engine.markov import evaluate, exhaustive, run_distribution
from batting_order.engine.run_expectancy import run_expectancy, run_values
from batting_order.engine.states import OUTCOMES, Kernel
from batting_order.evaluate.games import kernel_for
from batting_order.model.matchup import GameContext, build_matchup
from batting_order.model.pa_model import Hyper, Snapshot, build_snapshot
from batting_order.optimize.search import batter_summaries, heuristic_the_book

log = logging.getLogger(__name__)
SCHEMA_VERSION = 1
# Statcast team abbreviations differ from StatsAPI in a few cases.
STATSAPI_TO_STATCAST = {
    "AZ": "AZ",
    "ATH": "ATH",
    "CWS": "CWS",
    "KC": "KC",
    "SD": "SD",
    "SF": "SF",
    "TB": "TB",
    "WSH": "WSH",
}


def git_revision(root: Path) -> str:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"], cwd=root, text=True
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return "unknown"


def _r(a: np.ndarray, nd: int = 6) -> list[Any]:
    return np.round(np.asarray(a, dtype=np.float64), nd).tolist()  # type: ignore[no-any-return]


@dataclass
class TeamResult:
    payload: dict[str, Any]


def _team(
    snap: Snapshot,
    kernel: Kernel,
    lineup: TeamLineup,
    opp: TeamLineup,
    opp_abbr: str,
    throws: str,
    n_draws: int,
    rng: np.random.Generator,
    observed_runs: int | None,
) -> dict[str, Any]:
    batters = [h.player_id for h in lineup.starters]
    ctx = GameContext(batters, opp.starting_pitcher_id, throws, opp_abbr)
    m = build_matchup(snap, ctx)
    ident = list(range(9))
    ev_act = evaluate(kernel, m, ident)
    ex = exhaustive(kernel, m)
    vals = ex.values.ravel()
    opt, opt_val = ex.best()
    ev_opt = evaluate(kernel, m, opt)
    rv = run_values(kernel, np.einsum("g,gic->c", m.w.mean(axis=0), m.x) / 9)
    summ = batter_summaries(m, rv)
    book = heuristic_the_book(summ)
    worst_i = int(np.argmin(vals))
    worst = ex.order(worst_i // 9, worst_i % 9)
    top_idx = np.argsort(-vals)[:10]
    top = [
        {"order": [int(v) for v in ex.order(int(i) // 9, int(i) % 9)], "er9": float(vals[i])}
        for i in top_idx
    ]
    hist_counts, edges = np.histogram(vals, bins=60)

    # Parameter uncertainty: posterior draws of batter, starter and bullpen multipliers.
    draws_x, d_act, d_opt, d_best, same = [], [], [], [], []
    slot_freq = np.zeros((9, 9))
    for _ in range(n_draws):
        s2 = snap.sample(rng, batters, [opp.starting_pitcher_id], [opp_abbr])
        m2 = build_matchup(s2, ctx)
        draws_x.append(m2.x)
        ex2 = exhaustive(kernel, m2)
        b2, v2 = ex2.best()
        d_act.append(ex2.value_of(ident))
        d_opt.append(ex2.value_of(opt))
        d_best.append(v2)
        slot_freq[np.arange(9), b2] += 1
        same.append(bool(np.array_equal(b2, opt)))
    d_act_a, d_opt_a, d_best_a = map(np.asarray, (d_act, d_opt, d_best))
    diff = d_opt_a - d_act_a

    hitters = []
    for i, h in enumerate(lineup.starters):
        hitters.append(
            {
                "id": h.player_id,
                "name": h.name,
                "pos": h.position,
                "slot": h.slot,
                "side_vs_starter": snap.side(h.player_id, throws),
                "history_pa": round(snap.batter_n.get(h.player_id, 0.0), 1),
                "probs_starter": _r(m.x[0, i]),
                "probs_bullpen": _r(m.x[1, i]),
                "obp": round(float(summ["obp"][i]), 4),
                "power": round(float(summ["power"][i]), 4),
                "run_value": round(float(summ["rv"][i]), 4),
            }
        )
    dist_act = run_distribution(kernel, m, ident, max_runs=25)
    dist_opt = run_distribution(kernel, m, opt, max_runs=25)
    return {
        "team": lineup.abbreviation,
        "name": lineup.team_name,
        "observed_runs": observed_runs,
        "opponent_starter": {
            "id": opp.starting_pitcher_id,
            "name": opp.starting_pitcher_name,
            "throws": throws,
            "history_pa": round(snap.pitcher_n.get(opp.starting_pitcher_id, 0.0), 1),
        },
        "hitters": hitters,
        "regime_weights": _r(m.w, 4),
        "actual": {
            "order": ident,
            "er9": ev_act.expected_runs,
            "by_inning": _r(ev_act.runs_by_inning),
            "pa_by_slot": _r(ev_act.pa_by_slot),
            "run_distribution": _r(dist_act, 6),
            "percentile": float((vals < ev_act.expected_runs).mean()),
        },
        "optimal": {
            "order": [int(v) for v in opt],
            "er9": opt_val,
            "by_inning": _r(ev_opt.runs_by_inning),
            "pa_by_slot": _r(ev_opt.pa_by_slot),
            "run_distribution": _r(dist_opt, 6),
        },
        "the_book": {"order": [int(v) for v in book], "er9": ex.value_of(book)},
        "worst": {"order": [int(v) for v in worst], "er9": float(vals.min())},
        "all_orders": {
            "count": int(vals.size),
            "mean": float(vals.mean()),
            "sd": float(vals.std()),
            "hist": {"edges": _r(edges, 5), "counts": hist_counts.tolist()},
        },
        "top10": top,
        "uncertainty": {
            "n_draws": n_draws,
            "diff_mean": float(diff.mean()),
            "diff_q05": float(np.quantile(diff, 0.05)),
            "diff_q95": float(np.quantile(diff, 0.95)),
            "p_opt_better": float((diff > 0).mean()),
            "actual_q05": float(np.quantile(d_act_a, 0.05)),
            "actual_q95": float(np.quantile(d_act_a, 0.95)),
            "opt_q05": float(np.quantile(d_opt_a, 0.05)),
            "opt_q95": float(np.quantile(d_opt_a, 0.95)),
            "regret_of_point_optimum_mean": float((d_best_a - d_opt_a).mean()),
            "p_same_optimum": float(np.mean(same)),
            "slot_player_freq": _r(slot_freq / n_draws, 3),
            "draws_x": [_r(x, 4) for x in draws_x],
        },
        "truncated_mass": max(ev_act.truncated_mass, ex.truncated_mass),
    }


def build_game_snapshot(
    game_pk: int,
    pa: pl.DataFrame,
    api: StatsApi,
    root: Path,
    hyper: Hyper = Hyper(),
    n_draws: int = 200,
    seed: int = 0,
    label: dict[str, str] | None = None,
) -> dict[str, Any]:
    box = api.boxscore(game_pk)
    lus = official_lineups(box)
    sched = {int(g["gamePk"]): g for g in api.schedule(_season_of(pa, game_pk))}
    g = sched[game_pk]
    game_date = date.fromisoformat(g["officialDate"])
    snap = build_snapshot(pa, game_date, hyper)
    kernels: dict[date, Kernel] = {}
    kernel = kernel_for(pa, game_date, kernels)
    rng = np.random.default_rng(seed)
    throws = _throws(pa, box)
    teams = {}
    for side, other in (("away", "home"), ("home", "away")):
        teams[side] = _team(
            snap,
            kernel,
            lus[side],
            lus[other],
            lus[other].abbreviation,
            throws[lus[other].starting_pitcher_id],
            n_draws,
            rng,
            lus[side].runs,
        )
    lg = np.mean([snap.league[k] for k in snap.league], axis=0)
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "software": {"package": __version__, "git": git_revision(root)},
        "game": {
            "game_pk": game_pk,
            "date": game_date.isoformat(),
            "game_type": g["gameType"],
            "series_description": g.get("seriesDescription", ""),
            "series_game_number": g.get("seriesGameNumber"),
            "venue": g["venue"]["name"],
            "status": g["status"]["detailedState"],
            "away": lus["away"].team_name,
            "home": lus["home"].team_name,
            "away_abbr": lus["away"].abbreviation,
            "home_abbr": lus["home"].abbreviation,
            "away_runs": lus["away"].runs,
            "home_runs": lus["home"].runs,
            **(label or {}),
        },
        "cutoff": {
            "information_before": game_date.isoformat(),
            "pa_history_from": (snap.cutoff - timedelta(days=hyper.window_days)).isoformat(),
            "kernel": kernel.meta,
        },
        "model": {"hyper": hyper.__dict__, "outcomes": list(OUTCOMES)},
        "kernel": {"P": _r(kernel.P, 7), "R": _r(kernel.R, 7)},
        "run_expectancy": _r(run_expectancy(kernel, lg).reshape(3, 8), 4),
        "teams": teams,
    }


def _season_of(pa: pl.DataFrame, game_pk: int) -> int:
    s = pa.filter(pl.col("game_pk") == game_pk)["season"]
    if s.len() == 0:
        raise KeyError(f"game {game_pk} not in processed data")
    return int(s[0])


def _throws(pa: pl.DataFrame, box: dict[str, Any]) -> dict[int, str]:
    out: dict[int, str] = {}
    for side in ("away", "home"):
        sp = int(box["teams"][side]["pitchers"][0])
        hands = pa.filter(pl.col("pitcher") == sp)["p_throws"]
        if hands.len() == 0:
            raise ValueError(f"no Statcast record of pitcher {sp}")
        out[sp] = str(hands.mode()[0])
    return out


def write_snapshot(obj: dict[str, Any], dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(obj, separators=(",", ":")), encoding="utf-8")
