"""Rolling-origin evaluation of plate-appearance models (experiment E2).

The evaluation period is split into consecutive blocks of ``step`` days. For the
block starting on date ``d`` a snapshot is fitted on PAs with ``game_date < d`` and
used to predict every PA in ``[d, d + step)``. Using one snapshot per block (rather
than per day) is conservative: predictions late in a block ignore up to
``step - 1`` days of available information, but no future information is ever used.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, timedelta

import numpy as np
import polars as pl
from numpy.typing import NDArray

from batting_order.engine.states import N_OUT
from batting_order.model.pa_model import Hyper, Snapshot, build_snapshot

FloatArr = NDArray[np.float64]
Predictor = Callable[[Snapshot, pl.DataFrame], FloatArr]


@dataclass
class RollingPredictions:
    rows: pl.DataFrame  # the evaluated PAs (with game_pk for clustering)
    probs: dict[str, FloatArr]  # model name -> (n, 8)

    @property
    def y(self) -> NDArray[np.int64]:
        return self.rows["c"].to_numpy()


def blocks(start: date, end: date, step: int) -> list[tuple[date, date]]:
    out = []
    d = start
    while d < end:
        out.append((d, min(d + timedelta(days=step), end)))
        d += timedelta(days=step)
    return out


def league_predictor(snap: Snapshot, rows: pl.DataFrame) -> FloatArr:
    return np.array(
        [
            snap.league[(snap.side(b, th), th)]
            for b, th in rows.select(["batter", "p_throws"]).iter_rows()
        ]
    )


def batter_only_predictor(snap: Snapshot, rows: pl.DataFrame) -> FloatArr:
    return np.array(
        [snap.probs(b, th, None) for b, th in rows.select(["batter", "p_throws"]).iter_rows()]
    )


def full_predictor(snap: Snapshot, rows: pl.DataFrame) -> FloatArr:
    return np.array(
        [
            snap.vs_pitcher(b, p, th)
            for b, p, th in rows.select(["batter", "pitcher", "p_throws"]).iter_rows()
        ]
    )


def snapshot_features(snap: Snapshot, rows: pl.DataFrame) -> FloatArr:
    """Inputs of the gradient-boosting comparator (M3), derived from the snapshot only."""
    feats = []
    for b, p, th in rows.select(["batter", "pitcher", "p_throws"]).iter_rows():
        st = snap.side(b, th)
        q = snap.league[(st, th)]
        mb = snap.batter_mult.get(b, np.ones(N_OUT))
        mp = snap.pitcher_mult.get(p, np.ones(N_OUT))
        feats.append(
            np.concatenate(
                [
                    np.log(q),
                    np.log(mb),
                    np.log(mp),
                    [
                        np.log1p(snap.batter_n.get(b, 0.0)),
                        np.log1p(snap.pitcher_n.get(p, 0.0)),
                        float(st == "L"),
                        float(th == "L"),
                    ],
                ]
            )
        )
    return np.array(feats)


def rolling(
    pa: pl.DataFrame,
    start: date,
    end: date,
    step: int,
    hyper: Hyper,
    predictors: dict[str, Predictor],
    game_types: tuple[str, ...] = ("R", "F", "D", "L", "W"),
) -> RollingPredictions:
    rows_all: list[pl.DataFrame] = []
    probs_all: dict[str, list[FloatArr]] = {k: [] for k in predictors}
    for lo, hi in blocks(start, end, step):
        rows = pa.filter(
            (pl.col("game_date") >= lo)
            & (pl.col("game_date") < hi)
            & pl.col("game_type").is_in(list(game_types))
        )
        if rows.height == 0:
            continue
        snap = build_snapshot(pa, lo, hyper)
        rows_all.append(
            rows.select(["game_pk", "game_date", "batter", "pitcher", "stand", "p_throws", "c"])
        )
        for name, fn in predictors.items():
            probs_all[name].append(fn(snap, rows))
    return RollingPredictions(pl.concat(rows_all), {k: np.vstack(v) for k, v in probs_all.items()})


# ----------------------------------------------------------------------
# Metrics
# ----------------------------------------------------------------------


def pa_log_loss(p: FloatArr, y: NDArray[np.int64]) -> FloatArr:
    return -np.log(np.clip(p[np.arange(len(y)), y], 1e-15, 1.0))


def pa_brier(p: FloatArr, y: NDArray[np.int64]) -> FloatArr:
    oh = np.zeros_like(p)
    oh[np.arange(len(y)), y] = 1.0
    return np.asarray(((p - oh) ** 2).sum(axis=1), dtype=np.float64)


def cluster_bootstrap_diff(
    loss_a: FloatArr,
    loss_b: FloatArr,
    clusters: NDArray[np.int64],
    n_boot: int = 2000,
    seed: int = 0,
) -> dict[str, float]:
    """Mean(loss_a - loss_b) with a 95% percentile CI, resampling whole games."""
    d = loss_a - loss_b
    uniq, inv = np.unique(clusters, return_inverse=True)
    sums = np.bincount(inv, weights=d)
    cnts = np.bincount(inv)
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(uniq), size=(n_boot, len(uniq)))
    boots = sums[idx].sum(axis=1) / cnts[idx].sum(axis=1)
    lo, hi = np.percentile(boots, [2.5, 97.5])
    return {"mean": float(d.mean()), "ci_low": float(lo), "ci_high": float(hi)}


def calibration_table(
    p: FloatArr, y: NDArray[np.int64], n_bins: int = 10
) -> list[dict[str, float]]:
    """Per-class reliability: mean predicted vs observed frequency in predicted-quantile bins."""
    out: list[dict[str, float]] = []
    for c in range(p.shape[1]):
        pc = p[:, c]
        edges = np.unique(np.quantile(pc, np.linspace(0, 1, n_bins + 1)))
        b = np.clip(np.searchsorted(edges, pc, side="right") - 1, 0, len(edges) - 2)
        for k in range(len(edges) - 1):
            m = b == k
            if m.sum() == 0:
                continue
            out.append(
                {
                    "class": c,
                    "bin": k,
                    "n": int(m.sum()),
                    "pred": float(pc[m].mean()),
                    "obs": float((y[m] == c).mean()),
                }
            )
    return out


def ece(p: FloatArr, y: NDArray[np.int64], n_bins: int = 10) -> float:
    """Class-wise expected calibration error, averaged over classes (quantile bins)."""
    tab = calibration_table(p, y, n_bins)
    tot = len(y)
    per_class = np.zeros(p.shape[1])
    for r in tab:
        per_class[int(r["class"])] += r["n"] / tot * abs(r["pred"] - r["obs"])
    return float(per_class.mean())
