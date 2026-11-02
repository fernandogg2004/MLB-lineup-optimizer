"""Paper experiments E1–E5 (protocol: docs/methodology/experimental-protocol.md).

Results go to ``outputs/<experiment>.json`` (small, versioned) and large per-row
tables to ``work/`` (not versioned). Every number in the paper and the dashboard's
validation page is read from ``outputs/``.
"""

from __future__ import annotations

import json
import logging
import time
from collections.abc import Callable
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import numpy as np
import polars as pl

from batting_order import __version__
from batting_order.config import project_root
from batting_order.config import tuned_hyper as _tuned_hyper
from batting_order.data.build import load_lineups, load_transitions
from batting_order.engine.markov import Matchup, exhaustive, run_distribution
from batting_order.engine.run_expectancy import run_expectancy
from batting_order.engine.states import N_OUT, OUTCOMES
from batting_order.evaluate.games import run_games
from batting_order.evaluate.pa_eval import (
    batter_only_predictor,
    calibration_table,
    cluster_bootstrap_diff,
    ece,
    full_predictor,
    league_predictor,
    pa_brier,
    pa_log_loss,
    rolling,
    snapshot_features,
)
from batting_order.model.kernel import fit_kernel, kernel_for
from batting_order.model.matchup import GameContext, build_matchup
from batting_order.model.pa_model import Hyper, build_snapshot
from batting_order.optimize.search import (
    CountingObjective,
    NoisyObjective,
    SearchResult,
    batter_summaries,
    genetic,
    heuristic_sorted,
    heuristic_the_book,
    local_search,
    multistart_local_search,
    simulated_annealing,
)
from batting_order.snapshot import git_revision

log = logging.getLogger(__name__)
# Resolved at run time from $BATTING_ORDER_ROOT / the current directory (see config.py).
ROOT = Path(".")
DATA = ROOT / "data"
OUT = ROOT / "outputs"
WORK = ROOT / "work"
SEASONS = [2021, 2022, 2023, 2024, 2025, 2026]


def _set_root(root: Path) -> None:
    global ROOT, DATA, OUT, WORK
    ROOT, DATA, OUT, WORK = root, root / "data", root / "outputs", root / "work"


def _save(name: str, obj: dict[str, Any]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    obj = {
        "experiment": name,
        "generated_at": date.today().isoformat(),
        "software": {"package": __version__, "git": git_revision(ROOT)},
        **obj,
    }
    (OUT / f"{name}.json").write_text(json.dumps(obj, indent=1, default=float), encoding="utf-8")
    log.info("wrote outputs/%s.json", name)


def tuned_hyper() -> Hyper:
    return _tuned_hyper(ROOT)[0]


# ----------------------------------------------------------------------
# E0 — audit of inferred starting lineups against official boxscores
# ----------------------------------------------------------------------


def e0(lineups: pl.DataFrame, n: int = 60) -> None:
    from batting_order.data.statsapi import StatsApi, official_lineups

    api = StatsApi(DATA / "raw" / "statsapi")
    sample = lineups.filter(pl.col("reliable") & (pl.col("season") == 2026)).sample(n, seed=7)
    rows = []
    for r in sample.iter_rows(named=True):
        off = official_lineups(api.boxscore(r["game_pk"]))
        side = "away" if r["bat_team"] == r["away_team"] else "home"
        other = "home" if side == "away" else "away"
        rows.append(
            {
                "game_pk": r["game_pk"],
                "lineup_match": [h.player_id for h in off[side].starters] == list(r["lineup"]),
                "starter_match": off[other].starting_pitcher_id == r["opp_starter"],
            }
        )
    df = pl.DataFrame(rows)
    share = float((df["lineup_match"] & df["starter_match"]).mean())
    _save(
        "e0_lineup_audit",
        {
            "n": df.height,
            "share_both_match": share,
            "share_lineup_match": float(df["lineup_match"].mean()),
            "share_starter_match": float(df["starter_match"].mean()),
            "rows": rows,
        },
    )


# ----------------------------------------------------------------------
# E1 — kernel vs observed run expectancy
# ----------------------------------------------------------------------


def e1(pa: pl.DataFrame) -> None:
    half = ["game_pk", "inning", "inning_topbot"]
    res = {}
    for season in (2023, 2024, 2025, 2026):
        sp = pa.filter(pl.col("season") == season)
        cens = sp.filter(pl.col("censored")).select(half).unique()
        sp = sp.join(cens, on=half, how="anti").sort(["game_pk", "at_bat_number"])
        sp = sp.with_columns(
            pl.col("runs").reverse().cum_sum().reverse().over(half).alias("runs_to_end")
        )
        emp = sp.group_by("s").agg(pl.col("runs_to_end").mean(), pl.len()).sort("s")
        emp_re = np.zeros(24)
        n = np.zeros(24)
        for s, r, k in emp.iter_rows():
            emp_re[s], n[s] = r, k
        k = fit_kernel(pa, date(season + 1, 1, 1), date(season, 1, 1))
        x = np.bincount(sp["c"].to_numpy(), minlength=N_OUT).astype(float)
        x /= x.sum()
        model_re = run_expectancy(k, x)
        res[str(season)] = {
            "model_re24": np.round(model_re, 4).tolist(),
            "empirical_re24": np.round(emp_re, 4).tolist(),
            "n_by_state": n.astype(int).tolist(),
            "max_abs_diff": float(np.abs(model_re - emp_re).max()),
            "weighted_mean_abs_diff": float((np.abs(model_re - emp_re) * n).sum() / n.sum()),
            "transitions": int(sp.height),
            "non_conserved": int((~sp["conserved"]).sum()),
            "league_mix": dict(zip(OUTCOMES, np.round(x, 4).tolist(), strict=True)),
            # Selection check: outcome mix observed in state 5 (runners on 1st and 3rd, 0 out).
            "state5_mix": dict(
                zip(
                    OUTCOMES,
                    np.round(
                        np.bincount(sp.filter(pl.col("s") == 5)["c"].to_numpy(), minlength=N_OUT)
                        / max(sp.filter(pl.col("s") == 5).height, 1),
                        4,
                    ).tolist(),
                    strict=True,
                )
            ),
            "state5_immediate_runs_model_vs_data": {
                "model": np.round(k.R[:, 5], 4).tolist(),
                "data": [
                    float(v) if v == v else None
                    for v in (
                        sp.filter((pl.col("s") == 5) & pl.col("conserved"))
                        .group_by("c")
                        .agg(pl.col("runs").mean())
                        .sort("c")
                        .join(pl.DataFrame({"c": list(range(N_OUT))}), on="c", how="right")
                        .sort("c")["runs"]
                        .fill_null(float("nan"))
                        .to_list()
                    )
                ],
            },
        }
    _save(
        "e1_kernel",
        {
            "by_season": res,
            "note": "Empirical RE excludes walk-off half-innings; "
            "model RE uses a kernel fitted on the same season with league-average hitters.",
        },
    )


# ----------------------------------------------------------------------
# E2 — PA model selection
# ----------------------------------------------------------------------


# Grid extended (2026-11-02) after the first 2024 tuning run selected the lower boundary of
# both prior strengths; still tuned on 2024 only, before any test-season metric was viewed.
BS_GRID = (0.125, 0.25, 0.5, 1.0, 2.0)
PS_GRID = (0.1875, 0.375, 0.75, 1.5, 3.0)
HL_GRID = (180.0, 270.0, 365.0, 730.0, 1095.0)


def e2_tune(pa: pl.DataFrame, quick: bool) -> Hyper:
    grid = [(bs, ps, hl) for bs in BS_GRID for ps in PS_GRID for hl in HL_GRID]
    if quick:
        grid = grid[:3]
    start, end = date(2024, 4, 1), date(2024, 10, 1)
    rows = []
    for bs, ps, hl in grid:
        h = Hyper(batter_scale=bs, pitcher_scale=ps, half_life_days=hl)
        rp = rolling(pa, start, end, 14, h, {"m2": full_predictor}, game_types=("R",))
        ll = float(pa_log_loss(rp.probs["m2"], rp.y).mean())
        rows.append({"batter_scale": bs, "pitcher_scale": ps, "half_life_days": hl, "log_loss": ll})
        log.info("tune %s -> %.5f", (bs, ps, hl), ll)
    best = min(rows, key=lambda r: r["log_loss"])
    on_boundary = {
        "batter_scale": best["batter_scale"] in (BS_GRID[0], BS_GRID[-1]),
        "pitcher_scale": best["pitcher_scale"] in (PS_GRID[0], PS_GRID[-1]),
        "half_life_days": best["half_life_days"] in (HL_GRID[0], HL_GRID[-1]),
    }
    _save(
        "e2_tuning",
        {
            "period": [str(start), str(end)],
            "grid": rows,
            "selected": best,
            "selected_on_grid_boundary": on_boundary,
        },
    )
    return Hyper(
        batter_scale=best["batter_scale"],
        pitcher_scale=best["pitcher_scale"],
        half_life_days=best["half_life_days"],
    )


def _lgbm_train(pa: pl.DataFrame, h: Hyper, quick: bool) -> Any:
    import lightgbm as lgb

    start = date(2023, 4, 1) if not quick else date(2024, 6, 1)
    feats, ys = [], []
    from batting_order.evaluate.pa_eval import blocks

    for lo, hi in blocks(start, date(2024, 10, 1), 14):
        rows = pa.filter((pl.col("game_date") >= lo) & (pl.col("game_date") < hi))
        if rows.height == 0:
            continue
        snap = build_snapshot(pa, lo, h)
        feats.append(snapshot_features(snap, rows))
        ys.append(rows["c"].to_numpy())
    X, y = np.vstack(feats), np.concatenate(ys)
    cut = int(len(y) * 0.9)  # chronological validation split for early stopping
    model = lgb.LGBMClassifier(
        objective="multiclass",
        n_estimators=2000,
        learning_rate=0.03,
        num_leaves=31,
        min_child_samples=500,
        subsample=0.8,
        subsample_freq=1,
        colsample_bytree=0.8,
        verbose=-1,
        random_state=0,
        deterministic=True,
        force_row_wise=True,
    )
    model.fit(
        X[:cut],
        y[:cut],
        eval_set=[(X[cut:], y[cut:])],
        callbacks=[lgb.early_stopping(50, verbose=False)],
    )
    return model


def e2(pa: pl.DataFrame, quick: bool) -> None:
    h = e2_tune(pa, quick)
    h_default = Hyper()
    lgbm = _lgbm_train(pa, h, quick)

    def lgbm_pred(snap: Any, rows: pl.DataFrame) -> np.ndarray:
        p = lgbm.predict_proba(snapshot_features(snap, rows))
        out = np.zeros((rows.height, N_OUT))
        out[:, lgbm.classes_] = p
        return out

    results = {}
    for season in (2025, 2026):
        start, end = date(season, 3, 1), date(season, 11, 16)
        if quick:
            start, end = date(season, 6, 1), date(season, 6, 29)
        rp = rolling(
            pa,
            start,
            end,
            14,
            h,
            {
                "M0_league": league_predictor,
                "M1_batter": batter_only_predictor,
                "M2_batter_pitcher": full_predictor,
                "M3_lightgbm": lgbm_pred,
            },
        )
        rp_def = rolling(pa, start, end, 14, h_default, {"M2_default_hyper": full_predictor})
        rp.probs["M2_default_hyper"] = rp_def.probs["M2_default_hyper"]
        y = rp.y
        games = rp.rows["game_pk"].to_numpy()
        ref = pa_log_loss(rp.probs["M2_batter_pitcher"], y)
        models = {}
        for name, p in rp.probs.items():
            ll = pa_log_loss(p, y)
            models[name] = {
                "log_loss": float(ll.mean()),
                "brier": float(pa_brier(p, y).mean()),
                "ece_classwise": ece(p, y),
                "diff_vs_M2": cluster_bootstrap_diff(ll, ref, games),
            }
        results[str(season)] = {
            "n_pa": len(y),
            "n_games": len(np.unique(games)),
            "models": models,
            "calibration_M2": calibration_table(rp.probs["M2_batter_pitcher"], y),
            "observed_mix": np.round(np.bincount(y, minlength=N_OUT) / len(y), 4).tolist(),
        }
        WORK.mkdir(exist_ok=True)
        np.savez_compressed(
            WORK / f"e2_probs_{season}.npz",
            y=y,
            games=games,
            **{k: v.astype(np.float32) for k, v in rp.probs.items()},
        )
    _save(
        "e2_pa_models",
        {
            "selected_hyper": h.__dict__,
            "default_hyper": h_default.__dict__,
            "block_days": 14,
            "by_season": results,
            "lightgbm_iterations": int(lgbm.best_iteration_ or 0),
        },
    )


def _m3_matchup(snap: Any, ctx: GameContext, lgbm: Any) -> Matchup:
    """Matchup whose outcome probabilities come from the gradient-boosting model M3."""
    from batting_order.evaluate.pa_eval import snapshot_features

    base = build_matchup(snap, ctx)
    rows_sp = pl.DataFrame(
        {
            "batter": ctx.batters,
            "pitcher": [ctx.opp_starter] * 9,
            "p_throws": [ctx.opp_starter_throws] * 9,
        }
    )
    x_sp = lgbm.predict_proba(snapshot_features(snap, rows_sp))
    # Bullpen: mix over hands, using the bullpen multiplier as the pitcher multiplier.
    share_r = snap.bullpen_hand_share.get(ctx.opp_team, 0.72)
    mult = snap.bullpen_mult.get(ctx.opp_team, np.ones(N_OUT))
    x_bp = np.zeros((9, N_OUT))
    for hand, wgt in (("R", share_r), ("L", 1 - share_r)):
        feats = []
        for b in ctx.batters:
            st = snap.side(b, hand)
            q = snap.league[(st, hand)]
            feats.append(
                np.concatenate(
                    [
                        np.log(q),
                        np.log(snap.batter_mult.get(b, np.ones(N_OUT))),
                        np.log(mult),
                        [
                            np.log1p(snap.batter_n.get(b, 0.0)),
                            np.log1p(1e4),
                            float(st == "L"),
                            float(hand == "L"),
                        ],
                    ]
                )
            )
        x_bp += wgt * lgbm.predict_proba(np.array(feats))
    x = np.stack([x_sp, x_bp])
    x = x / x.sum(axis=2, keepdims=True)
    return Matchup(x, base.w)


def e2c_decision_sensitivity(pa: pl.DataFrame, lineups: pl.DataFrame, quick: bool) -> None:
    """Do M2 and M3 lead to the same lineup decisions on test games?"""
    h = tuned_hyper()
    lgbm = _lgbm_train(pa, h, quick)
    games = lineups.filter(pl.col("reliable") & (pl.col("season") >= 2025)).sample(
        20 if quick else 300, seed=5
    )
    kernels: dict[date, Any] = {}
    rows = []
    for r in games.iter_rows(named=True):
        d = r["game_date"]
        snap = build_snapshot(pa, d, h)
        kernel = kernel_for(pa, d, kernels)
        ctx = GameContext(
            list(r["lineup"]), r["opp_starter"], r["opp_starter_throws"], r["fld_team"]
        )
        ex2 = exhaustive(kernel, build_matchup(snap, ctx))
        ex3 = exhaustive(kernel, _m3_matchup(snap, ctx, lgbm))
        o2, v2 = ex2.best()
        o3, v3 = ex3.best()
        ident = np.arange(9)
        rows.append(
            {
                "same_optimum": bool(np.array_equal(o2, o3)),
                "uplift_m2": v2 - ex2.value_of(ident),
                "uplift_m3": v3 - ex3.value_of(ident),
                "m3_value_of_m2_optimum_gap": v3 - ex3.value_of(o2),
                "er_actual_m2": ex2.value_of(ident),
                "er_actual_m3": ex3.value_of(ident),
                "corr_all_orders": float(np.corrcoef(ex2.values.ravel(), ex3.values.ravel())[0, 1]),
            }
        )
    df = pl.DataFrame(rows)
    _save(
        "e2c_decision_sensitivity",
        {
            "n_team_games": df.height,
            "share_same_optimum": float(df["same_optimum"].mean()),
            "mean_uplift_m2": float(df["uplift_m2"].mean()),
            "mean_uplift_m3": float(df["uplift_m3"].mean()),
            "mean_loss_using_m2_optimum_under_m3": float(df["m3_value_of_m2_optimum_gap"].mean()),
            "max_loss_using_m2_optimum_under_m3": float(df["m3_value_of_m2_optimum_gap"].max()),
            "mean_abs_diff_er_actual": float(
                (df["er_actual_m2"] - df["er_actual_m3"]).abs().mean()
            ),
            "mean_corr_values_over_all_orders": float(df["corr_all_orders"].mean()),
        },
    )


# Common 7-class taxonomy shared with the original model: K, BB, 1B, 2B, 3B, HR, OUT(in play).
COARSE_NEW = np.array([0, 1, 2, 3, 4, 5, 6, 6])  # new class -> coarse
COARSE_LEGACY = np.array([6, 0, 1, 2, 3, 4, 5, 6])  # legacy class -> coarse (OUT, K, BB.., DP)


def e2_legacy(pa: pl.DataFrame) -> None:
    """Original project's 51-feature LightGBM vs M2 on its out-of-sample 2026 window."""
    path = WORK / "legacy_2026.parquet"
    if not path.exists():
        log.warning("work/legacy_2026.parquet missing; run scripts/legacy_pa_predictions.py")
        return
    leg = pl.read_parquet(path).with_columns(pl.col("game_date").str.to_date())
    pcols = [f"p{k}" for k in range(8)]
    # Legacy features are (almost) daily-grain: predictions within (batter, pitcher, date)
    # differ by at most the recorded spread (doubleheaders); the first PA's prediction is used.
    spread = leg.group_by(["batter_id", "pitcher_id", "game_date"]).agg(
        *[(pl.col(c).max() - pl.col(c).min()).alias(c) for c in pcols]
    )
    max_spread = float(spread.select(pl.max_horizontal(pcols)).max().item())
    leg1 = leg.unique(["batter_id", "pitcher_id", "game_date"], keep="first").rename(
        {"batter_id": "batter", "pitcher_id": "pitcher"}
    )
    dates = sorted(leg["game_date"].unique().to_list())
    start: date = dates[0]
    end: date = dates[-1] + timedelta(days=1)
    rp = rolling(
        pa,
        start,
        end,
        14,
        tuned_hyper(),
        {"M0_league": league_predictor, "M2_batter_pitcher": full_predictor},
    )
    rows = rp.rows.with_row_index("i").join(
        leg1, on=["batter", "pitcher", "game_date"], how="inner"
    )
    idx = rows["i"].to_numpy()
    y = COARSE_NEW[rows["c"].to_numpy()]

    def coarse(p: np.ndarray, mapping: np.ndarray) -> np.ndarray:
        out = np.zeros((p.shape[0], 7))
        for k, j in enumerate(mapping):
            out[:, j] += p[:, k]
        return out

    legacy_p = coarse(rows.select(pcols).to_numpy(), COARSE_LEGACY)
    games = rows["game_pk"].to_numpy()
    res = {}
    ref = pa_log_loss(coarse(rp.probs["M2_batter_pitcher"][idx], COARSE_NEW), y)
    for name, p in (
        ("legacy_lightgbm_51_features", legacy_p),
        ("M0_league", coarse(rp.probs["M0_league"][idx], COARSE_NEW)),
        ("M2_batter_pitcher", coarse(rp.probs["M2_batter_pitcher"][idx], COARSE_NEW)),
    ):
        ll = pa_log_loss(p, y)
        res[name] = {
            "log_loss": float(ll.mean()),
            "brier": float(pa_brier(p, y).mean()),
            "diff_vs_M2": cluster_bootstrap_diff(ll, ref, games),
        }
    _save(
        "e2b_legacy_comparison",
        {
            "window": [str(start), str(end)],
            "n_pa_matched": len(y),
            "n_pa_new_table": rp.rows.height,
            "max_within_group_prediction_spread": max_spread,
            "taxonomy": "K,BB,1B,2B,3B,HR,OUT",
            "models": res,
            "note": "Legacy features are recomputed daily (more recent than M2's 14-day refits).",
        },
    )


# ----------------------------------------------------------------------
# E3 / E4b — game level
# ----------------------------------------------------------------------


def _team_history_baseline(pa: pl.DataFrame, games: pl.DataFrame) -> np.ndarray:
    """Team mean runs in innings 1-8 over its previous 60 games (strictly earlier dates)."""
    r8 = (
        pa.filter(pl.col("inning") <= 8)
        .group_by(["game_pk", "game_date", "bat_team"])
        .agg(pl.col("runs").sum().alias("r8"))
        .sort("game_date")
    )
    out = np.empty(games.height)
    by_team = {t: df for (t,), df in r8.group_by(["bat_team"])}
    for i, (team, d) in enumerate(games.select(["bat_team", "game_date"]).iter_rows()):
        df = by_team[team].filter(pl.col("game_date") < d).tail(60)
        out[i] = float(df["r8"].cast(pl.Float64).mean() or np.nan) if df.height else np.nan
    return out


def _ols(x: np.ndarray, y: np.ndarray) -> tuple[float, float]:
    A = np.column_stack([np.ones_like(x), x])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    return float(coef[0]), float(coef[1])


def e3_e4b(pa: pl.DataFrame, lineups: pl.DataFrame, quick: bool) -> None:
    h = tuned_hyper()
    parts = []
    for season in (2025, 2026):
        path = WORK / f"games_{season}.parquet"
        if path.exists() and not quick:
            parts.append(pl.read_parquet(path))
            continue
        g = run_games(
            pa,
            lineups,
            date(season, 3, 1),
            date(season, 11, 16),
            h,
            max_games=60 if quick else None,
        )
        if not quick:
            WORK.mkdir(exist_ok=True)
            g.write_parquet(path)
        parts.append(g)
    g = pl.concat(parts).filter(pl.col("runs_8").is_not_null())
    # Only team-games that batted at least 8 innings can be compared with E[R_1..8].
    innings = pa.group_by(["game_pk", "bat_team"]).agg(pl.col("inning").max().alias("max_inn"))
    n_before = g.height
    g = g.join(innings, on=["game_pk", "bat_team"], how="left").filter(pl.col("max_inn") >= 8)
    n_short = n_before - g.height
    obs = g["runs_8"].to_numpy().astype(float)
    pred = g["pred_r8"].to_numpy()
    team_base = _team_history_baseline(pa, g)
    prior_mean = {
        s: float(
            pa.filter((pl.col("season") == s - 1) & (pl.col("inning") <= 8))
            .group_by(["game_pk", "bat_team"])
            .agg(pl.col("runs").sum())["runs"]
            .mean()
        )
        for s in (2025, 2026)
    }
    const = np.array([prior_mean[d.year] for d in g["game_date"].to_list()])
    ok = ~np.isnan(team_base)
    rng = np.random.default_rng(0)
    boots = []
    n = len(obs)
    for _ in range(2000):
        idx = rng.integers(0, n, n)
        a, b = _ols(pred[idx], obs[idx])
        boots.append((b, (obs[idx] - pred[idx]).mean()))
    boots_a = np.array(boots)
    a, b = _ols(pred, obs)

    def mse(p: np.ndarray, m: np.ndarray = ok) -> float:
        return float(np.mean((obs[m] - p[m]) ** 2))

    e3 = {
        "n_team_games": n,
        "excluded_fewer_than_8_innings": n_short,
        "mean_observed_r8": float(obs.mean()),
        "mean_predicted_r8": float(pred.mean()),
        "bias_obs_minus_pred": float((obs - pred).mean()),
        "bias_ci95": np.percentile(boots_a[:, 1], [2.5, 97.5]).tolist(),
        "calibration_intercept": a,
        "calibration_slope": b,
        "slope_ci95": np.percentile(boots_a[:, 0], [2.5, 97.5]).tolist(),
        "corr": float(np.corrcoef(pred, obs)[0, 1]),
        "mse": {
            "model": mse(pred),
            "constant_prior_season": mse(const),
            "team_last60": mse(team_base),
        },
        "mse_n": int(ok.sum()),
        "by_decile": _deciles(pred, obs),
    }
    e3["pit"] = _pit(pa, lineups, g, h, 300 if not quick else 20)
    _save("e3_run_calibration", e3)

    up = (g["pred_r9_opt"] - g["pred_r9_actual"]).to_numpy()

    def s(col: str) -> dict[str, float]:
        v = (g["pred_r9_opt"] - g[col]).to_numpy()
        return {
            "mean_gap_to_opt": float(v.mean()),
            "median": float(np.median(v)),
            "p90": float(np.quantile(v, 0.9)),
        }

    by_type = {}
    for gt, df in g.group_by("game_type"):
        u = (df["pred_r9_opt"] - df["pred_r9_actual"]).to_numpy()
        by_type[str(gt[0])] = {
            "n": df.height,
            "uplift_mean": float(u.mean()),
            "pct_actual_mean": float(df["pct_actual"].mean()),
        }
    e4b = {
        "n_team_games": g.height,
        "uplift_opt_vs_actual": {
            "mean": float(up.mean()),
            "median": float(np.median(up)),
            "q90": float(np.quantile(up, 0.9)),
            "max": float(up.max()),
            "se": float(up.std(ddof=1) / np.sqrt(len(up))),
            "per_162_games": float(up.mean() * 162),
        },
        "spread_best_minus_worst_mean": float((g["pred_r9_opt"] - g["pred_r9_worst"]).mean()),
        "opt_minus_random_mean": float((g["pred_r9_opt"] - g["pred_r9_random_mean"]).mean()),
        "actual_percentile": {
            "mean": float(g["pct_actual"].mean()),
            "median": float(g["pct_actual"].median()),
            "share_above_90": float((g["pct_actual"] > 0.9).mean()),
        },
        "heuristics": {
            k: s(c)
            for k, c in (
                ("actual", "pred_r9_actual"),
                ("the_book", "pred_r9_book"),
                ("sort_run_value", "pred_r9_rv_sorted"),
                ("sort_obp", "pred_r9_obp_sorted"),
                ("random_mean", "pred_r9_random_mean"),
            )
        },
        "by_game_type": by_type,
        "uplift_histogram": np.histogram(up, bins=30)[0].tolist(),
        "uplift_hist_edges": np.round(np.histogram(up, bins=30)[1], 4).tolist(),
        "caveat": "Model-based quantities; not observed causal effects of batting order.",
    }
    _save("e4b_actual_vs_optimal", e4b)


def _deciles(pred: np.ndarray, obs: np.ndarray) -> list[dict[str, float]]:
    q = np.quantile(pred, np.linspace(0, 1, 11))
    b = np.clip(np.searchsorted(q, pred, side="right") - 1, 0, 9)
    return [
        {
            "decile": k,
            "n": int((b == k).sum()),
            "pred": float(pred[b == k].mean()),
            "obs": float(obs[b == k].mean()),
            "obs_se": float(obs[b == k].std(ddof=1) / np.sqrt(max((b == k).sum(), 1))),
        }
        for k in range(10)
    ]


def _pit(
    pa: pl.DataFrame, lineups: pl.DataFrame, g: pl.DataFrame, h: Hyper, n: int
) -> dict[str, Any]:
    """Randomised PIT of observed R_8 under the exact predicted distribution."""
    rng = np.random.default_rng(1)
    sub = g.sample(min(n, g.height), seed=1)
    lu = lineups.select(
        ["game_pk", "bat_team", "lineup", "opp_starter", "opp_starter_throws", "fld_team"]
    )
    sub = sub.join(lu, on=["game_pk", "bat_team", "fld_team"], how="left")
    pits, cover80, implied = [], [], []
    kernels: dict[date, Any] = {}
    snaps: dict[date, Any] = {}
    for r in sub.iter_rows(named=True):
        d = r["game_date"]
        if d not in snaps:
            snaps[d] = build_snapshot(pa, d, h)
        m = build_matchup(
            snaps[d],
            GameContext(
                list(r["lineup"]), r["opp_starter"], r["opp_starter_throws"], r["fld_team"]
            ),
        )
        dist = run_distribution(
            kernel_for(pa, d, kernels), m, list(range(9)), max_runs=30, innings=8
        )
        y = int(r["runs_8"])
        cdf = np.cumsum(dist)
        below = cdf[y - 1] if y > 0 else 0.0
        pits.append(below + rng.random() * dist[min(y, len(dist) - 1)])
        lo = int(np.searchsorted(cdf, 0.1))
        hi = int(np.searchsorted(cdf, 0.9))
        cover80.append(lo <= y <= hi)
        implied.append(float(dist[lo : hi + 1].sum()))
    hist = np.histogram(pits, bins=10, range=(0, 1))[0]
    return {
        "n": len(pits),
        "pit_hist": hist.tolist(),
        "coverage_80_nominal": float(np.mean(cover80)),
        # The discrete "central 80%" interval holds more than 80% of the model's own mass;
        # observed coverage should be compared with this model-implied value.
        "coverage_80_model_implied": float(np.mean(implied)),
    }


# ----------------------------------------------------------------------
# E4a / E4d — search methods
# ----------------------------------------------------------------------


SearchFn = Callable[[CountingObjective, np.random.Generator, np.ndarray], SearchResult]


def _ls(f: CountingObjective, rng: np.random.Generator, s: np.ndarray) -> SearchResult:
    return local_search(f, s)


def _ls10(f: CountingObjective, rng: np.random.Generator, s: np.ndarray) -> SearchResult:
    return multistart_local_search(f, rng, 10, s)


def _sa(f: CountingObjective, rng: np.random.Generator, s: np.ndarray) -> SearchResult:
    return simulated_annealing(f, rng, s)


def _ga(f: CountingObjective, rng: np.random.Generator, s: np.ndarray) -> SearchResult:
    return genetic(f, rng, seeds=[s])


SEARCHES: list[tuple[str, SearchFn]] = [
    ("local_search_from_actual", _ls),
    ("local_search_x10", _ls10),
    ("simulated_annealing", _sa),
    ("genetic_exact", _ga),
]


def e4a(pa: pl.DataFrame, lineups: pl.DataFrame, quick: bool) -> None:
    h = tuned_hyper()
    games = lineups.filter(
        pl.col("reliable") & (pl.col("season") == 2026) & (pl.col("game_type") == "R")
    ).sample(20 if quick else 200, seed=42)
    rng = np.random.default_rng(7)
    methods: dict[str, list[dict[str, float]]] = {}
    kernels: dict[date, Any] = {}
    noisy_rows = []
    for gi, r in enumerate(games.iter_rows(named=True)):
        d = r["game_date"]
        snap = build_snapshot(pa, d, h)
        kernel = kernel_for(pa, d, kernels)
        m = build_matchup(
            snap,
            GameContext(
                list(r["lineup"]), r["opp_starter"], r["opp_starter_throws"], r["fld_team"]
            ),
        )
        t = time.perf_counter()
        ex = exhaustive(kernel, m)
        opt_order, opt = ex.best()
        t_ex = time.perf_counter() - t
        ident = np.arange(9, dtype=np.int64)
        from batting_order.engine.run_expectancy import run_values

        summ = batter_summaries(m, run_values(kernel, np.einsum("g,gic->c", m.w.mean(0), m.x) / 9))

        def rec(
            name: str, order: np.ndarray, evals: int, secs: float, ex: Any = ex, opt: float = opt
        ) -> None:
            v = ex.value_of(order)
            methods.setdefault(name, []).append(
                {"gap": opt - v, "evals": evals, "secs": secs, "found": float(abs(opt - v) < 1e-12)}
            )

        rec("exhaustive", opt_order, 362_880, t_ex)
        rec("actual", ident, 0, 0.0)
        rec("the_book", heuristic_the_book(summ), 0, 0.0)
        rec("sort_run_value", heuristic_sorted(summ["rv"]), 0, 0.0)
        rec("sort_obp", heuristic_sorted(summ["obp"]), 0, 0.0)
        for name, fn in SEARCHES:
            fe = CountingObjective(kernel, m)
            t = time.perf_counter()
            res = fn(fe, rng, ident)
            rec(name, res.order, fe.calls, time.perf_counter() - t)
        if gi < (4 if quick else 30):
            fn_noisy = NoisyObjective(kernel, m, 4000, seed=gi)
            t = time.perf_counter()
            res = genetic(fn_noisy, rng, seeds=[ident])
            secs = time.perf_counter() - t
            rec("genetic_mc4000_original", res.order, fn_noisy.calls, secs)
            noisy_rows.append(
                {
                    "reported_by_search": res.value,
                    "exact_of_chosen": ex.value_of(res.order),
                    "exact_optimum": opt,
                }
            )
        log.info("e4a %d/%d", gi + 1, games.height)
    summary = {}
    for name, rows in methods.items():
        gaps = np.array([x["gap"] for x in rows])
        summary[name] = {
            "n": len(rows),
            "mean_gap": float(gaps.mean()),
            "max_gap": float(gaps.max()),
            "share_optimal": float(np.mean([x["found"] for x in rows])),
            "mean_evaluations": float(np.mean([x["evals"] for x in rows])),
            "mean_seconds": float(np.mean([x["secs"] for x in rows])),
        }
    nr = noisy_rows
    _save(
        "e4a_search_methods",
        {
            "methods": summary,
            "noisy_ga": {
                "n": len(nr),
                "mean_winners_curse": float(
                    np.mean([x["reported_by_search"] - x["exact_of_chosen"] for x in nr])
                ),
                "mean_gap_to_opt": float(
                    np.mean([x["exact_optimum"] - x["exact_of_chosen"] for x in nr])
                ),
            },
            "note": (
                "gap = exact E[R_9] of the exhaustive optimum minus exact E[R_9] "
                "of the returned order."
            ),
        },
    )


def e4a_matched(pa: pl.DataFrame, lineups: pl.DataFrame) -> None:
    """Gap of the order actually used on the same instances as the Monte Carlo GA (E4a).

    E4a ran the noisy GA only on the first 30 of its 200 sampled team-games; comparisons with
    the order used must be made on those same instances (audit findings B-1/D-1).
    """
    path = OUT / "e4a_search_methods.json"
    res = json.loads(path.read_text(encoding="utf-8"))
    n_noisy = int(res["noisy_ga"]["n"])
    h = tuned_hyper()
    games = lineups.filter(
        pl.col("reliable") & (pl.col("season") == 2026) & (pl.col("game_type") == "R")
    ).sample(200, seed=42)
    kernels: dict[date, Any] = {}
    gaps = []
    for r in games.head(n_noisy).iter_rows(named=True):
        d = r["game_date"]
        m = build_matchup(
            build_snapshot(pa, d, h),
            GameContext(
                list(r["lineup"]), r["opp_starter"], r["opp_starter_throws"], r["fld_team"]
            ),
        )
        ex = exhaustive(kernel_for(pa, d, kernels), m)
        gaps.append(ex.best()[1] - ex.value_of(np.arange(9)))
    res["noisy_ga"]["actual_mean_gap_same_instances"] = float(np.mean(gaps))
    res["noisy_ga"]["actual_max_gap_same_instances"] = float(np.max(gaps))
    path.write_text(json.dumps(res, indent=1, default=float), encoding="utf-8")
    log.info("e4a matched: actual gap on %d GA instances = %.5f", n_noisy, np.mean(gaps))


# ----------------------------------------------------------------------
# E4c — parameter uncertainty
# ----------------------------------------------------------------------


def e4c(pa: pl.DataFrame, lineups: pl.DataFrame, quick: bool) -> None:
    h = tuned_hyper()
    games = lineups.filter(pl.col("reliable") & (pl.col("season") == 2026)).sample(
        8 if quick else 80, seed=11
    )
    rng = np.random.default_rng(3)
    kernels: dict[date, Any] = {}
    rows = []
    for r in games.iter_rows(named=True):
        d = r["game_date"]
        snap = build_snapshot(pa, d, h)
        kernel = kernel_for(pa, d, kernels)
        ctx = GameContext(
            list(r["lineup"]), r["opp_starter"], r["opp_starter_throws"], r["fld_team"]
        )
        ex = exhaustive(kernel, build_matchup(snap, ctx))
        opt, _ = ex.best()
        diffs, same = [], []
        for _ in range(5 if quick else 40):
            s2 = snap.sample(rng, ctx.batters, [ctx.opp_starter], [ctx.opp_team])
            ex2 = exhaustive(kernel, build_matchup(s2, ctx))
            b2, _ = ex2.best()
            diffs.append(ex2.value_of(opt) - ex2.value_of(np.arange(9)))
            same.append(float(np.array_equal(b2, opt)))
        dd = np.array(diffs)
        rows.append(
            {
                "p_opt_better": float((dd > 0).mean()),
                "diff_mean": float(dd.mean()),
                "diff_q05": float(np.quantile(dd, 0.05)),
                "diff_q95": float(np.quantile(dd, 0.95)),
                "p_same_optimum": float(np.mean(same)),
            }
        )
    df = pl.DataFrame(rows)
    _save(
        "e4c_parameter_uncertainty",
        {
            "n_team_games": df.height,
            "draws_per_game": 5 if quick else 40,
            "mean_p_opt_better": float(df["p_opt_better"].mean()),
            "share_games_p_above_0_9": float((df["p_opt_better"] > 0.9).mean()),
            "mean_interval_width": float((df["diff_q95"] - df["diff_q05"]).mean()),
            "share_interval_excludes_0": float((df["diff_q05"] > 0).mean()),
            "mean_p_same_optimum": float(df["p_same_optimum"].mean()),
            "rows": rows,
        },
    )


# ----------------------------------------------------------------------
# E5 — reference game sensitivity (main numbers come from the snapshot)
# ----------------------------------------------------------------------


def e5(pa: pl.DataFrame, quick: bool) -> None:
    from batting_order.data.statsapi import StatsApi
    from batting_order.snapshot import build_game_snapshot

    ref = build_game_snapshot(
        849799,
        pa,
        StatsApi(DATA / "raw" / "statsapi"),
        ROOT,
        hyper=None,  # the builder loads the tuned values and records their source
        n_draws=20 if quick else 400,
        seed=2026,
    )
    sens: dict[str, dict[str, Any]] = {}
    d = date(2026, 10, 28)
    for label, (k_start, h) in {
        "kernel_2021_2022": (date(2021, 3, 1), tuned_hyper()),
        "default_hyper": (None, Hyper()),
    }.items():
        snap = build_snapshot(pa, d, h)
        kernel = fit_kernel(pa, date(2023, 1, 1), k_start) if k_start else kernel_for(pa, d, {})
        sens[label] = {}
        for side, t in ref["teams"].items():
            opp = ref["teams"]["home" if side == "away" else "away"]
            ctx = GameContext(
                [x["id"] for x in t["hitters"]],
                t["opponent_starter"]["id"],
                t["opponent_starter"]["throws"],
                opp["team"],
            )
            ex = exhaustive(kernel, build_matchup(snap, ctx))
            o, v = ex.best()
            sens[label][t["team"]] = {
                "optimal_order": [t["hitters"][i]["name"] for i in o],
                "uplift": v - ex.value_of(np.arange(9)),
                "same_as_main": [int(i) for i in o] == t["optimal"]["order"],
            }
    summary = {
        side: {k: v for k, v in t.items() if k in ("team", "name", "observed_runs")}
        | {
            "actual_er9": t["actual"]["er9"],
            "optimal_er9": t["optimal"]["er9"],
            "percentile": t["actual"]["percentile"],
            "the_book_er9": t["the_book"]["er9"],
            "worst_er9": t["worst"]["er9"],
            "actual_order": [x["name"] for x in t["hitters"]],
            "optimal_order": [t["hitters"][i]["name"] for i in t["optimal"]["order"]],
            "uncertainty": {
                k: v
                for k, v in t["uncertainty"].items()
                if k not in ("draws_x", "slot_player_freq")
            },
        }
        for side, t in ref["teams"].items()
    }
    from batting_order.engine.markov import out_probability_floor

    snap_main = build_snapshot(pa, date(2026, 10, 28), tuned_hyper())
    kernel_main = kernel_for(pa, date(2026, 10, 28), {})
    q_min = 1.0
    certificate: dict[str, dict[str, float]] = {}
    for side, t in ref["teams"].items():
        opp = ref["teams"]["home" if side == "away" else "away"]
        ctx = GameContext(
            [x["id"] for x in t["hitters"]],
            t["opponent_starter"]["id"],
            t["opponent_starter"]["throws"],
            opp["team"],
        )
        m_ref = build_matchup(snap_main, ctx)
        q_min = min(q_min, out_probability_floor(kernel_main, m_ref))
        vals = np.sort(exhaustive(kernel_main, m_ref).values.ravel())
        certificate[t["team"]] = {"best_minus_second": float(vals[-1] - vals[-2])}
    _save(
        "e5_reference_game",
        {
            "game": ref["game"],
            "teams": summary,
            "sensitivity": sens,
            "q_min": q_min,
            "truncated_mass_max": max(t["truncated_mass"] for t in ref["teams"].values()),
            "certificate": certificate,
            "kernel": ref["cutoff"]["kernel"],
        },
    )
    if not quick:
        from batting_order.snapshot import write_snapshot

        write_snapshot(ref, ROOT / "web" / "public" / "data" / "games" / "849799.json")


def main(only: list[str] | None = None, quick: bool = False) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    _set_root(project_root())
    seasons = [s for s in SEASONS if (DATA / "processed" / f"transitions_{s}.parquet").exists()]
    pa = load_transitions(DATA, seasons)
    lineups = load_lineups(DATA, seasons)
    todo = only or ["e0", "e1", "e2", "e2b", "e2c", "e3", "e4a", "e4a_matched", "e4c", "e5"]
    for name in todo:
        t = time.time()
        {
            "e0": lambda: e0(lineups),
            "e1": lambda: e1(pa),
            "e2": lambda: e2(pa, quick),
            "e2b": lambda: e2_legacy(pa),
            "e2c": lambda: e2c_decision_sensitivity(pa, lineups, quick),
            "e3": lambda: e3_e4b(pa, lineups, quick),
            "e4a": lambda: e4a(pa, lineups, quick),
            "e4a_matched": lambda: e4a_matched(pa, lineups),
            "e4c": lambda: e4c(pa, lineups, quick),
            "e5": lambda: e5(pa, quick),
        }[name]()
        log.info("%s done in %.0fs", name, time.time() - t)
