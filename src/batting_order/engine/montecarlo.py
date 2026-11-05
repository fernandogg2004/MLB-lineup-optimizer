"""Monte Carlo simulation of the same model (independent check and noisy-search baseline).

Samples games from exactly the stochastic model that ``markov.py`` evaluates in
closed form, so ``mean(simulate(...)) -> evaluate(...).expected_runs`` as the number
of simulated games grows (strong law of large numbers). It is used (i) to
cross-validate the exact evaluator and (ii) to run a genetic search with noisy
(simulated) fitness, the common simulation-based approach that the paper compares against.
"""

from __future__ import annotations

import numba as nb
import numpy as np
from numpy.typing import NDArray

from batting_order.engine.markov import Matchup
from batting_order.engine.states import ABSORB, MAX_RUNS_PER_PA, N_OUT, N_STATES, Kernel

FloatArr = NDArray[np.float64]


@nb.njit(cache=True)
def _draw(cum: FloatArr, u: float) -> int:
    n = cum.shape[0]
    for i in range(n):
        if u < cum[i]:
            return i
    return int(n - 1)


@nb.njit(cache=True)
def _simulate(
    cumx: FloatArr,
    cumJ: FloatArr,
    cumw: FloatArr,
    order: NDArray[np.int64],
    n_games: int,
    seed: int,
) -> FloatArr:
    np.random.seed(seed)
    out = np.empty(n_games)
    R1 = MAX_RUNS_PER_PA + 1
    for gi in range(n_games):
        slot = 0
        total = 0
        for k in range(9):
            g = _draw(cumw[k], np.random.random())
            s = 0
            while s != ABSORB:
                c = _draw(cumx[g, order[slot]], np.random.random())
                idx = _draw(cumJ[c, s], np.random.random())
                s = idx // R1
                total += idx % R1
                slot = (slot + 1) % 9
        out[gi] = total
    return out


def simulate(
    kernel: Kernel, m: Matchup, order: list[int] | NDArray[np.int64], n_games: int, seed: int
) -> FloatArr:
    """Runs over 9 innings for ``n_games`` simulated games (common seed => common numbers)."""
    cumx = np.cumsum(m.x, axis=2)
    cumJ = np.cumsum(kernel.J.reshape(N_OUT, N_STATES, -1), axis=2)
    cumw = np.cumsum(m.w, axis=1)
    return _simulate(cumx, cumJ, cumw, np.asarray(order, dtype=np.int64), n_games, seed)
