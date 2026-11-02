"""Empirical-Bayes plate-appearance outcome model (paper, Section 3).

For batter ``b`` facing pitcher ``p`` the outcome distribution over the eight
classes is

    pi(c | b, p) ∝ q_{h(b,p)}(c) * m_b(c) * m_p(c),                      (3.1)

where ``q_h`` is the league distribution for the handedness matchup ``h`` (batter
side x pitcher hand) and ``m_b``, ``m_p`` are batter and pitcher multipliers. With
time-decayed counts ``n_b(c)`` (weight ``2^{-age/H}``) and the matching expected
counts ``e_b(c) = sum_PA w * q_{h(PA)}(c)`` under the league model,

    m_b(c) = (n_b(c) + a_c) / (e_b(c) + a_c),                              (3.2)

i.e. the posterior mean of a Gamma-Poisson rate ratio with prior mean one and
prior strength ``a_c`` expected events. Multipliers therefore shrink to one for
players with little history. Pitchers use (3.2) with strengths ``b_c``. A fielding
team's bullpen is treated as one pseudo-pitcher built from all of its relievers'
PAs. All statistics are computed from PAs strictly before the cutoff date.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from typing import Any

import numpy as np
import polars as pl
from numpy.typing import NDArray

from batting_order.engine.states import N_OUT

FloatArr = NDArray[np.float64]
HANDS = ("L", "R")
# Relative prior strengths per class (in expected events). They follow the ordering of
# published stabilization rates (strikeouts and walks stabilize fastest, triples and
# batted-ball outcomes slowest) and are multiplied by a single tuned scale.
BASE_STRENGTH = np.array([12.0, 15.0, 40.0, 25.0, 6.0, 12.0, 60.0, 60.0])


@dataclass(frozen=True)
class Hyper:
    """Hyperparameters, tuned on 2024 only.

    Selected by experiment E2 (``evaluate/run.py:e2_tune``); loaded by ``config.tuned_hyper``.
    """

    batter_scale: float = 1.0
    pitcher_scale: float = 1.5
    half_life_days: float = 365.0
    window_days: int = 3 * 365
    starter_prior_starts: float = 8.0

    @property
    def a(self) -> FloatArr:
        return BASE_STRENGTH * self.batter_scale

    @property
    def b(self) -> FloatArr:
        return BASE_STRENGTH * self.pitcher_scale


@dataclass
class Snapshot:
    """Everything the model knows at a cutoff (built from PAs with date < cutoff)."""

    cutoff: date
    hyper: Hyper
    league: dict[tuple[str, str], FloatArr]  # (stand, throws) -> q
    batter_mult: dict[int, FloatArr]
    batter_n: dict[int, float]
    batter_side: dict[tuple[int, str], str]  # (batter, throws) -> stand
    pitcher_mult: dict[int, FloatArr]
    pitcher_n: dict[int, float]
    bullpen_mult: dict[str, FloatArr]  # fielding team -> multiplier
    bullpen_hand_share: dict[str, float]  # team -> share of RHP PAs
    starter_curve: dict[int, FloatArr]  # pitcher -> (9,) share by inning
    league_starter_curve: FloatArr = field(default_factory=lambda: np.ones(9))
    use_pitcher: bool = True
    # Gamma posterior (shape, rate) of each multiplier, for parameter-uncertainty draws.
    batter_post: dict[int, tuple[FloatArr, FloatArr]] = field(default_factory=dict)
    pitcher_post: dict[int, tuple[FloatArr, FloatArr]] = field(default_factory=dict)
    bullpen_post: dict[str, tuple[FloatArr, FloatArr]] = field(default_factory=dict)

    def sample(
        self, rng: np.random.Generator, batters: list[int], pitchers: list[int], teams: list[str]
    ) -> Snapshot:
        """Copy with multipliers of the given players drawn from their Gamma posteriors.

        ``m ~ Gamma(shape = n + a, rate = e + a)`` independently per class (paper,
        Section 3.4). Players without history keep the prior, ``Gamma(a, a)``.
        """

        def draw(
            post: dict[Any, tuple[FloatArr, FloatArr]], key: object, strength: FloatArr
        ) -> FloatArr:
            shape, rate = post.get(key, (strength, strength))
            return np.asarray(rng.gamma(shape, 1.0 / rate), dtype=np.float64)

        bm = dict(self.batter_mult)
        for b in batters:
            bm[b] = draw(self.batter_post, b, self.hyper.a)
        pm = dict(self.pitcher_mult)
        for p in pitchers:
            pm[p] = draw(self.pitcher_post, p, self.hyper.b)
        tm = dict(self.bullpen_mult)
        for team in teams:
            tm[team] = draw(self.bullpen_post, team, self.hyper.b)
        return replace(self, batter_mult=bm, pitcher_mult=pm, bullpen_mult=tm)

    # ------------------------------------------------------------------
    def side(self, batter: int, throws: str) -> str:
        s = self.batter_side.get((batter, throws))
        if s is not None:
            return s
        return "L" if throws == "R" else "R"  # unknown: assume platoon advantage is taken

    def probs(self, batter: int, throws: str, pitcher_mult: FloatArr | None) -> FloatArr:
        q = self.league[(self.side(batter, throws), throws)]
        v = q * self.batter_mult.get(batter, np.ones(N_OUT))
        if self.use_pitcher and pitcher_mult is not None:
            v = v * pitcher_mult
        return np.asarray(v / v.sum(), dtype=np.float64)

    def vs_pitcher(self, batter: int, pitcher: int, throws: str) -> FloatArr:
        return self.probs(batter, throws, self.pitcher_mult.get(pitcher))

    def vs_bullpen(self, batter: int, team: str) -> FloatArr:
        share_r = self.bullpen_hand_share.get(team, 0.72)
        mult = self.bullpen_mult.get(team)
        return share_r * self.probs(batter, "R", mult) + (1 - share_r) * self.probs(
            batter, "L", mult
        )

    def starter_weights(self, pitcher: int) -> FloatArr:
        """``w[k]`` = expected share of inning-k PAs faced by the starter."""
        return self.starter_curve.get(pitcher, self.league_starter_curve)


def _decay(cutoff: date, half_life: float) -> pl.Expr:
    age = (pl.lit(cutoff) - pl.col("game_date")).dt.total_days().cast(pl.Float64)
    return (2.0 ** (-age / half_life)).alias("w")


def _keys(df: pl.DataFrame, key: str) -> tuple[np.ndarray, np.ndarray]:
    """Sorted unique keys and the index of each row (deterministic)."""
    vals = df[key].to_numpy()
    keys, inv = np.unique(vals, return_inverse=True)
    return keys, inv


def _class_matrix(df: pl.DataFrame, key: str, weight: str = "w") -> tuple[np.ndarray, FloatArr]:
    """Weighted class counts per key -> (keys, counts[len(keys), 8]).

    Uses sequential ``np.bincount`` so results are bit-identical across runs (parallel
    group-by sums are not, because floating-point addition is not associative).
    """
    keys, inv = _keys(df, key)
    c = df["c"].to_numpy()
    w = df[weight].to_numpy()
    flat = np.bincount(inv * N_OUT + c, weights=w, minlength=len(keys) * N_OUT)
    return keys, np.asarray(flat.reshape(len(keys), N_OUT), dtype=np.float64)


def _expected_matrix(
    df: pl.DataFrame, key: str, league: dict[tuple[str, str], FloatArr]
) -> tuple[np.ndarray, FloatArr]:
    keys, inv = _keys(df, key)
    w = df["w"].to_numpy()
    E = np.zeros((len(keys), N_OUT))
    st = df["stand"].to_numpy()
    th = df["p_throws"].to_numpy()
    for s_ in HANDS:
        for t_ in HANDS:
            m = (st == s_) & (th == t_)
            if m.any():
                tot = np.bincount(inv[m], weights=w[m], minlength=len(keys))
                E += tot[:, None] * league[(s_, t_)][None, :]
    return keys, E


def _multipliers(
    n_keys: np.ndarray, n: FloatArr, e_keys: np.ndarray, E: FloatArr, strength: FloatArr
) -> tuple[dict[Any, FloatArr], dict[Any, float], dict[Any, tuple[FloatArr, FloatArr]]]:
    e_idx = {k: i for i, k in enumerate(e_keys.tolist())}
    mult: dict[Any, FloatArr] = {}
    tot: dict[Any, float] = {}
    post: dict[Any, tuple[FloatArr, FloatArr]] = {}
    for i, k in enumerate(n_keys.tolist()):
        shape = n[i] + strength
        rate = E[e_idx[k]] + strength
        mult[k] = shape / rate
        tot[k] = float(n[i].sum())
        post[k] = (shape, rate)
    return mult, tot, post


def build_snapshot(
    pa: pl.DataFrame, cutoff: date, hyper: Hyper = Hyper(), use_pitcher: bool = True
) -> Snapshot:
    """Fit the model on PAs with ``cutoff - window <= game_date < cutoff``."""
    start = cutoff - timedelta(days=hyper.window_days)
    win = pa.filter((pl.col("game_date") < cutoff) & (pl.col("game_date") >= start))
    if win.height == 0:
        raise ValueError(f"no plate appearances before {cutoff}")
    win = win.with_columns(_decay(cutoff, hyper.half_life_days))

    # League distribution per handedness matchup (decay-weighted).
    league: dict[tuple[str, str], FloatArr] = {}
    for st in HANDS:
        for th in HANDS:
            sub = win.filter((pl.col("stand") == st) & (pl.col("p_throws") == th))
            counts = np.bincount(sub["c"].to_numpy(), weights=sub["w"].to_numpy(), minlength=N_OUT)
            league[(st, th)] = (counts + 1.0) / (counts.sum() + N_OUT)

    bk, bn = _class_matrix(win, "batter")
    bek, bE = _expected_matrix(win, "batter", league)
    batter_mult, batter_n, batter_post = _multipliers(bk, bn, bek, bE, hyper.a)

    batter_side: dict[tuple[int, str], str] = {}
    for th in HANDS:
        sub = win.filter(pl.col("p_throws") == th)
        keys, inv = _keys(sub, "batter")
        is_l = sub["stand"].to_numpy() == "L"
        w = sub["w"].to_numpy()
        wl = np.bincount(inv, weights=w * is_l, minlength=len(keys))
        wr = np.bincount(inv, weights=w * ~is_l, minlength=len(keys))
        for k, a, b in zip(keys.tolist(), wl, wr, strict=True):
            batter_side[(k, th)] = "L" if a > b else "R"

    pk, pn = _class_matrix(win, "pitcher")
    pek, pE = _expected_matrix(win, "pitcher", league)
    pitcher_mult, pitcher_n, pitcher_post = _multipliers(pk, pn, pek, pE, hyper.b)

    # Starters: first pitcher of the fielding team in each game.
    starters = (
        win.sort(["game_pk", "at_bat_number"])
        .group_by(["game_pk", "fld_team"])
        .agg(pl.col("pitcher").first().alias("sp"))
    )
    win = win.join(starters, on=["game_pk", "fld_team"], how="left").with_columns(
        (pl.col("pitcher") == pl.col("sp")).alias("is_sp")
    )

    relief = win.filter(~pl.col("is_sp")).with_columns(pl.col("fld_team").alias("team"))
    tk, tn = _class_matrix(relief, "team")
    tek, tE = _expected_matrix(relief, "team", league)
    bull, _, bull_post = _multipliers(tk, tn, tek, tE, hyper.b)
    rk, rinv = _keys(relief, "team")
    rw = relief["w"].to_numpy()
    rr_ = np.bincount(rinv, weights=rw * (relief["p_throws"].to_numpy() == "R"), minlength=len(rk))
    bullpen_hand_share = {
        k: float(a / b)
        for k, a, b in zip(
            rk.tolist(), rr_, np.bincount(rinv, weights=rw, minlength=len(rk)), strict=True
        )
    }

    league_curve, curves = _starter_curves(win, hyper)
    return Snapshot(
        cutoff,
        hyper,
        league,
        batter_mult,
        batter_n,
        batter_side,
        pitcher_mult,
        pitcher_n,
        bull,
        bullpen_hand_share,
        curves,
        league_curve,
        use_pitcher,
        batter_post,
        pitcher_post,
        bull_post,
    )


def _starter_curves(win: pl.DataFrame, hyper: Hyper) -> tuple[FloatArr, dict[int, FloatArr]]:
    """Share of each inning's PAs (innings 1-9) faced by the starter, per start."""
    reg = win.filter(pl.col("inning") <= 9)
    per = reg.group_by(["game_pk", "fld_team", "inning"]).agg(
        pl.col("is_sp").mean().alias("share"), pl.col("sp").first(), pl.col("w").first()
    )
    starts = per.select(["game_pk", "fld_team", "sp", "w"]).unique(["game_pk", "fld_team"])
    grid = starts.join(pl.DataFrame({"inning": list(range(1, 10))}), how="cross")
    full = grid.join(
        per.select(["game_pk", "fld_team", "inning", "share"]),
        on=["game_pk", "fld_team", "inning"],
        how="left",
    ).with_columns(pl.col("share").fill_null(0.0))
    full = full.sort(["game_pk", "fld_team", "inning"])
    inn = full["inning"].to_numpy() - 1
    share = full["share"].to_numpy()
    w = full["w"].to_numpy()
    league_curve = np.bincount(inn, weights=share * w, minlength=9) / np.bincount(
        inn, weights=w, minlength=9
    )
    keys, inv = _keys(full, "sp")
    sw = np.bincount(inv * 9 + inn, weights=share * w, minlength=len(keys) * 9).reshape(-1, 9)
    ww = np.bincount(inv * 9 + inn, weights=w, minlength=len(keys) * 9).reshape(-1, 9)
    kappa = hyper.starter_prior_starts
    curves_arr = (sw + kappa * league_curve) / (ww + kappa)
    curves = {k: curves_arr[i] for i, k in enumerate(keys.tolist())}
    return league_curve, curves


# ----------------------------------------------------------------------
# Evaluation helpers
# ----------------------------------------------------------------------


def predict_frame(snap: Snapshot, pas: pl.DataFrame) -> FloatArr:
    """Predicted class probabilities for each PA row (uses batter, pitcher, hands)."""
    out = np.empty((pas.height, N_OUT))
    for i, (b, p, th) in enumerate(pas.select(["batter", "pitcher", "p_throws"]).iter_rows()):
        out[i] = snap.vs_pitcher(b, p, th)
    return out


def log_loss(probs: FloatArr, y: NDArray[np.int64]) -> float:
    eps = 1e-15
    return float(-np.mean(np.log(np.clip(probs[np.arange(len(y)), y], eps, 1.0))))


def brier(probs: FloatArr, y: NDArray[np.int64]) -> float:
    onehot = np.zeros_like(probs)
    onehot[np.arange(len(y)), y] = 1.0
    return float(np.mean(np.sum((probs - onehot) ** 2, axis=1)))


__all__ = ["Hyper", "Snapshot", "brier", "build_snapshot", "log_loss", "predict_frame"]
