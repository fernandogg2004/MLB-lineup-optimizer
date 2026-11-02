"""Exact expected-runs evaluation of a batting order (absorbing Markov chain).

Model (paper, Section 4). Within a half-inning the process is the base-out state
``s`` plus the batting-order slot ``t`` of the next batter. Batter ``i`` produces
outcome ``c`` with probability ``x[g, i, c]`` under pitching regime ``g`` (e.g. the
opposing starter or the bullpen); the kernel then moves ``s`` to ``s'``. Pitching
changes are assumed to happen between innings: inning ``k`` is pitched under regime
``g`` with probability ``w[k, g]`` independently of the game state (assumption A5).

For a fixed lineup and regime, one half-inning started by slot ``j`` yields

* ``r[j]``      expected runs scored in the inning, and
* ``L[j, j']``  probability that slot ``j'`` leads off the next inning.

Across innings the leadoff slot is a Markov chain, so with ``pi_1 = e_0``

    E[R_9] = sum_{k=1}^{9} pi_k . r_k,       pi_{k+1} = pi_k L_k,

where ``r_k = sum_g w[k,g] r^g`` and ``L_k = sum_g w[k,g] L^g``. The only numerical
approximation is truncating each half-inning once the unabsorbed probability mass
falls below ``tol``; the neglected mass is returned so that callers can bound the
error (paper, Proposition 3).
"""

from __future__ import annotations

from dataclasses import dataclass

import numba as nb
import numpy as np
from numpy.typing import NDArray

from batting_order.engine.states import ABSORB, MAX_RUNS_PER_PA, N_OUT, N_STATES, Kernel

FloatArr = NDArray[np.float64]
IntArr = NDArray[np.int64]

N_SLOTS = 9
N_INNINGS = 9
DEFAULT_TOL = 1e-13
MAX_STEPS = 1000


@dataclass(frozen=True)
class Matchup:
    """Outcome probabilities of the 9 hitters and the inning-by-inning pitching mix.

    Attributes:
        x: ``(G, 9, 8)`` outcome probabilities of player ``i`` (roster index, *not*
            batting slot) under pitching regime ``g``.
        w: ``(9, G)`` probability that inning ``k`` is pitched under regime ``g``.
    """

    x: FloatArr
    w: FloatArr

    def __post_init__(self) -> None:
        g = self.x.shape[0]
        if self.x.shape != (g, N_SLOTS, N_OUT):
            raise ValueError(f"x must have shape (G, 9, {N_OUT}); got {self.x.shape}")
        if self.w.shape != (N_INNINGS, g):
            raise ValueError(f"w must have shape (9, {g}); got {self.w.shape}")
        if np.any(self.x < 0) or not np.allclose(self.x.sum(axis=2), 1.0, atol=1e-9):
            raise ValueError("outcome probabilities must be non-negative and sum to one")
        if np.any(self.w < 0) or not np.allclose(self.w.sum(axis=1), 1.0, atol=1e-9):
            raise ValueError("regime weights must be non-negative and sum to one per inning")

    @staticmethod
    def single_regime(x: FloatArr) -> Matchup:
        return Matchup(x[None, :, :].astype(np.float64), np.ones((N_INNINGS, 1)))


def batter_operators(kernel: Kernel, m: Matchup) -> tuple[FloatArr, FloatArr]:
    """Per-(regime, player) one-step operators.

    Returns ``M[g, i] = sum_c x[g,i,c] P[c]`` with shape ``(G, 9, 24, 25)`` and
    ``rr[g, i] = sum_c x[g,i,c] R[c]`` with shape ``(G, 9, 24)``.
    """
    M = np.einsum("gic,csn->gisn", m.x, kernel.P)
    rr = np.einsum("gic,cs->gis", m.x, kernel.R)
    return np.ascontiguousarray(M), np.ascontiguousarray(rr)


@nb.njit(cache=True)
def _inning(
    M: FloatArr, rr: FloatArr, order: IntArr, start: int, s0: int, tol: float
) -> tuple[float, FloatArr, float]:
    """One half-inning for players ``order`` (slot -> player) led off by slot ``start``."""
    v = np.zeros(N_STATES)
    v[s0] = 1.0
    nxt = np.zeros(N_SLOTS)
    runs = 0.0
    pos = start
    mass = 1.0
    steps = 0
    while mass > tol and steps < MAX_STEPS:
        b = order[pos]
        Mb = M[b]
        rb = rr[b]
        w = np.zeros(N_STATES + 1)
        for s in range(N_STATES):
            vs = v[s]
            if vs == 0.0:
                continue
            runs += vs * rb[s]
            for s2 in range(N_STATES + 1):
                w[s2] += vs * Mb[s, s2]
        pos = (pos + 1) % N_SLOTS
        nxt[pos] += w[ABSORB]
        mass = 0.0
        for s in range(N_STATES):
            v[s] = w[s]
            mass += w[s]
        steps += 1
    if mass > tol:
        raise RuntimeError(
            "half-inning did not terminate within MAX_STEPS (out probability too small)"
        )
    return runs, nxt, mass


@nb.njit(cache=True)
def _inning_tables(
    M: FloatArr, rr: FloatArr, order: IntArr, tol: float
) -> tuple[FloatArr, FloatArr, float]:
    """``r`` (G, 9), ``L`` (G, 9, 9) and the largest truncated mass for one lineup."""
    G = M.shape[0]
    r = np.zeros((G, N_SLOTS))
    L = np.zeros((G, N_SLOTS, N_SLOTS))
    worst = 0.0
    for g in range(G):
        for j in range(N_SLOTS):
            runs, nxt, mass = _inning(M[g], rr[g], order, j, 0, tol)
            r[g, j] = runs
            L[g, j] = nxt
            worst = max(worst, mass)
    return r, L, worst


@nb.njit(cache=True)
def _game_value(r: FloatArr, L: FloatArr, w: FloatArr, rot: int) -> float:
    """E[R_9] given regime tables of a cyclic order, read with rotation ``rot``.

    Slot ``t`` of the rotated lineup is slot ``(t + rot) % 9`` of the tables.
    """
    G = r.shape[0]
    pi = np.zeros(N_SLOTS)
    pi[0] = 1.0
    total = 0.0
    for k in range(N_INNINGS):
        new = np.zeros(N_SLOTS)
        for j in range(N_SLOTS):
            pj = pi[j]
            if pj == 0.0:
                continue
            jj = (j + rot) % N_SLOTS
            for g in range(G):
                wg = w[k, g]
                if wg == 0.0:
                    continue
                total += pj * wg * r[g, jj]
                for j2 in range(N_SLOTS):
                    new[j2] += pj * wg * L[g, jj, (j2 + rot) % N_SLOTS]
        pi = new
    return total


@dataclass(frozen=True)
class Evaluation:
    expected_runs: float
    runs_by_inning: FloatArr  # (9,) E[runs in inning k]
    pa_by_slot: FloatArr  # (9,) expected plate appearances of each slot over 9 innings
    truncated_mass: float  # largest unabsorbed mass left in any half-inning


def evaluate(
    kernel: Kernel, m: Matchup, order: list[int] | IntArr, tol: float = DEFAULT_TOL
) -> Evaluation:
    """Exact E[runs over 9 innings] for ``order`` (slot -> roster index)."""
    o = np.asarray(order, dtype=np.int64)
    if sorted(o.tolist()) != list(range(N_SLOTS)):
        raise ValueError(f"order must be a permutation of 0..8, got {o.tolist()}")
    M, rr = batter_operators(kernel, m)
    r, L, worst = _inning_tables(M, rr, o, tol)
    pa = _expected_pa(M, o, m.w, L, tol)
    pi = np.zeros(N_SLOTS)
    pi[0] = 1.0
    by_inning = np.zeros(N_INNINGS)
    for k in range(N_INNINGS):
        rk = m.w[k] @ r
        Lk = np.einsum("g,gij->ij", m.w[k], L)
        by_inning[k] = pi @ rk
        pi = pi @ Lk
    return Evaluation(float(by_inning.sum()), by_inning, pa, float(worst))


def _expected_pa(M: FloatArr, order: IntArr, w: FloatArr, L: FloatArr, tol: float) -> FloatArr:
    """Expected number of plate appearances per batting slot over 9 innings."""
    G = M.shape[0]
    # pa_tab[g, j, t]: expected PAs by slot t in an inning led off by slot j.
    pa_tab = np.zeros((G, N_SLOTS, N_SLOTS))
    for g in range(G):
        for j in range(N_SLOTS):
            v = np.zeros(N_STATES)
            v[0] = 1.0
            pos, mass, steps = j, 1.0, 0
            while mass > tol and steps < MAX_STEPS:
                pa_tab[g, j, pos] += mass
                v = (v @ M[g, order[pos]])[:N_STATES]
                mass = float(v.sum())
                pos = (pos + 1) % N_SLOTS
                steps += 1
    pi = np.zeros(N_SLOTS)
    pi[0] = 1.0
    out = np.zeros(N_SLOTS)
    for k in range(N_INNINGS):
        out += pi @ np.einsum("g,gjt->jt", w[k], pa_tab)
        pi = pi @ np.einsum("g,gij->ij", w[k], L)
    return out


# ---------------------------------------------------------------------------
# Exhaustive search
# ---------------------------------------------------------------------------


def cyclic_orders() -> IntArr:
    """All 8! = 40,320 cyclic orders of players 0..8 with player 0 in slot 0."""
    from itertools import permutations

    rest = np.array(list(permutations(range(1, N_SLOTS))), dtype=np.int64)
    return np.hstack([np.zeros((rest.shape[0], 1), dtype=np.int64), rest])


@nb.njit(cache=True, parallel=True)
def _all_values(
    M: FloatArr, rr: FloatArr, w: FloatArr, cycles: IntArr, tol: float
) -> tuple[FloatArr, float]:
    n = cycles.shape[0]
    vals = np.empty((n, N_SLOTS))
    worst = np.zeros(n)
    for c in nb.prange(n):
        r, L, wm = _inning_tables(M, rr, cycles[c], tol)
        worst[c] = wm
        for rot in range(N_SLOTS):
            vals[c, rot] = _game_value(r, L, w, rot)
    return vals, np.max(worst)


@dataclass(frozen=True)
class ExhaustiveResult:
    values: FloatArr  # (40320, 9) E[R] of every lineup, indexed (cycle, rotation)
    cycles: IntArr  # (40320, 9)
    truncated_mass: float

    def order(self, cycle: int, rot: int) -> IntArr:
        return np.roll(self.cycles[cycle], -rot)

    def best(self, allowed: NDArray[np.bool_] | None = None) -> tuple[IntArr, float]:
        """Best lineup, optionally restricted by ``allowed[slot, player]``."""
        vals = (
            self.values
            if allowed is None
            else np.where(self.feasible(allowed), self.values, -np.inf)
        )
        c, rot = np.unravel_index(int(np.argmax(vals)), vals.shape)
        if not np.isfinite(vals[c, rot]):
            raise ValueError("no lineup satisfies the constraints")
        return self.order(int(c), int(rot)), float(vals[c, rot])

    def feasible(self, allowed: NDArray[np.bool_]) -> NDArray[np.bool_]:
        """Boolean mask (40320, 9): lineup satisfies ``allowed[slot, player]``."""
        ok = np.ones(self.values.shape, dtype=bool)
        for rot in range(N_SLOTS):
            orders = np.roll(self.cycles, -rot, axis=1)  # (n, 9) slot -> player
            ok[:, rot] = allowed[np.arange(N_SLOTS)[None, :], orders].all(axis=1)
        return ok

    def value_of(self, order: list[int] | IntArr) -> float:
        o = np.asarray(order, dtype=np.int64)
        rot = int(np.where(o == 0)[0][0])
        cyc = np.roll(o, -rot)
        idx = _cycle_index(cyc)
        # o[t] = cyc[(t + rot') % 9] with rot' = (9 - rot) % 9
        return float(self.values[idx, (N_SLOTS - rot) % N_SLOTS])


def _cycle_index(cyc: IntArr) -> int:
    """Lexicographic rank of ``cyc[1:]`` among permutations of 1..8."""
    rest = list(cyc[1:])
    items = list(range(1, N_SLOTS))
    rank = 0
    fact = [1, 1, 2, 6, 24, 120, 720, 5040, 40320]
    for i, v in enumerate(rest):
        k = items.index(int(v))
        rank += k * fact[len(rest) - 1 - i]
        items.pop(k)
    return rank


def exhaustive(kernel: Kernel, m: Matchup, tol: float = DEFAULT_TOL) -> ExhaustiveResult:
    """Exact E[R_9] of all 9! = 362,880 batting orders."""
    M, rr = batter_operators(kernel, m)
    cycles = cyclic_orders()
    vals, worst = _all_values(M, rr, np.ascontiguousarray(m.w), cycles, tol)
    return ExhaustiveResult(vals, cycles, float(worst))


# ---------------------------------------------------------------------------
# Exact run distribution (for presentation; not used by the optimizer)
# ---------------------------------------------------------------------------


def run_distribution(
    kernel: Kernel,
    m: Matchup,
    order: list[int] | IntArr,
    max_runs: int = 40,
    tol: float = 1e-12,
    innings: int = N_INNINGS,
) -> FloatArr:
    """Exact distribution of runs over the first ``innings`` innings, ``p[n] = P(R = n)``.

    Mass beyond ``max_runs`` is accumulated in the last cell.
    """
    o = np.asarray(order, dtype=np.int64)
    J = kernel.J
    G = m.x.shape[0]
    R1 = MAX_RUNS_PER_PA + 1
    # D[g, j, j2, n]: inning led off by slot j ends with slot j2 leading next, n runs.
    D = np.zeros((G, N_SLOTS, N_SLOTS, max_runs + 1))
    for g in range(G):
        T = np.einsum("ic,csnr->isnr", m.x[g], J)  # (9 players, 24, 25, 5)
        for j in range(N_SLOTS):
            v = np.zeros((N_STATES, max_runs + 1))
            v[0, 0] = 1.0
            pos, steps = j, 0
            while v.sum() > tol and steps < MAX_STEPS:
                Tb = T[o[pos]]
                nv = np.zeros((N_STATES + 1, max_runs + 1))
                for r in range(R1):
                    # mass moving to s2 with r additional runs
                    contrib = np.einsum("sn,sm->mn", v, Tb[:, :, r])  # (25, max_runs+1)
                    if r:
                        shifted = np.zeros_like(contrib)
                        shifted[:, r:] = contrib[:, :-r]
                        shifted[:, -1] += contrib[:, -r:].sum(axis=1)
                        contrib = shifted
                    nv += contrib
                pos = (pos + 1) % N_SLOTS
                D[g, j, pos] += nv[ABSORB]
                v = nv[:N_STATES]
                steps += 1
    # Forward over innings: state = (leadoff slot, runs so far).
    F = np.zeros((N_SLOTS, max_runs + 1))
    F[0, 0] = 1.0
    for k in range(innings):
        Dk = np.einsum("g,gjtn->jtn", m.w[k], D)
        NF = np.zeros_like(F)
        for j in range(N_SLOTS):
            for j2 in range(N_SLOTS):
                conv = np.convolve(F[j], Dk[j, j2])
                NF[j2] += conv[: max_runs + 1]
                NF[j2, -1] += conv[max_runs + 1 :].sum()
        F = NF
    p = F.sum(axis=0)
    return np.asarray(p / p.sum(), dtype=np.float64)


# ---------------------------------------------------------------------------
# Constants appearing in the paper's propositions
# ---------------------------------------------------------------------------


def out_probability_floor(kernel: Kernel, m: Matchup) -> float:
    """``q = min_{g,i,s} P(outs increase in one PA | s, batter i, regime g)`` (Assumption A4)."""
    from batting_order.engine.states import decode

    outs = np.array([decode(s)[0] for s in range(N_STATES)] + [3])
    up = (outs[None, :] > outs[:N_STATES, None]).astype(np.float64)  # (24, 25)
    p_out = (kernel.P * up[None, :, :]).sum(axis=2)  # (8, 24)
    return float(np.einsum("gic,cs->gis", m.x, p_out).min())


def truncation_error_bound(q: float, mass: float) -> float:
    """Bound on |E[R_9] - computed value| when every half-inning stops at mass ``<= mass``.

    Proposition 3 of the paper. Per inning, runs after truncation are at most the
    runners on base (<= 3) plus the remaining plate appearances, whose conditional
    expectation is <= 3/q; hence the per-inning error is <= (3 + 3/q) mass <= 6 mass/q.
    The lost leadoff mass adds at most (k-1) mass in total variation before inning k,
    and expected runs per inning are <= 3/q. Summing over nine innings:
    ``9 * 6/q * mass + 36 * 3/q * mass = 162 * mass / q``.
    """
    if not 0 < q <= 1:
        raise ValueError("q must lie in (0, 1]")
    return 162.0 * mass / q
