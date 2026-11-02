"""Empirical estimation of the batter-independent transition kernel.

For each outcome class ``c`` and state ``s`` the observed transitions
``(s', r)`` are counted over a window of games strictly before the prediction
cutoff. The estimate is the posterior mean under a Dirichlet prior centred on the
conventional deterministic advancement (``alpha`` pseudo-observations), which keeps
sparse cells (e.g. a triple with the bases loaded and two outs) well defined:

    J_hat[c, s, s', r] = (N[c, s, s', r] + alpha * J0[c, s, s', r]) / (N[c, s] + alpha).

Censored (walk-off) and bookkeeping-violating transitions are excluded.
"""

from __future__ import annotations

from datetime import date, timedelta

import numpy as np
import polars as pl

from batting_order.engine.states import (
    MAX_RUNS_PER_PA,
    N_NEXT,
    N_OUT,
    N_STATES,
    Kernel,
    deterministic_kernel,
)


def count_transitions(pa: pl.DataFrame) -> np.ndarray:
    """Counts ``N[c, s, s', r]`` from a transitions table."""
    ok = pa.filter(~pl.col("censored") & pl.col("conserved"))
    agg = ok.group_by(["c", "s", "s_next", "runs"]).len()
    N = np.zeros((N_OUT, N_STATES, N_NEXT, MAX_RUNS_PER_PA + 1))
    for c, s, s2, r, n in agg.iter_rows():
        N[c, s, s2, min(r, MAX_RUNS_PER_PA)] += n
    return N


def fit_kernel(pa: pl.DataFrame, cutoff: date, start: date, alpha: float = 2.0) -> Kernel:
    """Estimate the kernel from transitions with ``start <= game_date < cutoff``."""
    if start >= cutoff:
        raise ValueError("kernel window is empty")
    win = pa.filter((pl.col("game_date") >= start) & (pl.col("game_date") < cutoff))
    N = count_transitions(win)
    J0 = deterministic_kernel().J
    tot = N.sum(axis=(2, 3), keepdims=True)
    J = (N + alpha * J0) / (tot + alpha)
    return Kernel(
        J,
        label=f"empirical[{start}..{cutoff})",
        meta={
            "n_transitions": int(N.sum()),
            "alpha": alpha,
            "start": start.isoformat(),
            "cutoff": cutoff.isoformat(),
        },
    )


KERNEL_YEARS = 3
KERNEL_ERA_START = date(2023, 1, 1)  # 2023 rule changes (bases, pick-off limits, shift ban)


def kernel_for(pa: pl.DataFrame, d: date, cache: dict[date, Kernel]) -> Kernel:
    """Kernel for a game on ``d``: fitted on the window ending on the first day of its month.

    The window is the previous ``KERNEL_YEARS`` years, but not before the 2023 rule changes.
    """
    key = date(d.year, d.month, 1)
    if key not in cache:
        start = max(KERNEL_ERA_START, key - timedelta(days=365 * KERNEL_YEARS))
        if start >= key:  # early 2023: fall back to the previous year rather than nothing
            start = key - timedelta(days=365)
        cache[key] = fit_kernel(pa, key, start)
    return cache[key]
