"""Batting-order search methods compared in the paper (Section 6).

All methods maximise the same objective, E[R_9 | order], evaluated either exactly
(``markov.evaluate``) or, for the noisy baseline that reproduces the original
project, by Monte Carlo. ``exhaustive`` is the reference: it returns a certified
global optimum (up to the evaluator's truncation error).
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

from batting_order.engine.markov import Matchup, evaluate, exhaustive
from batting_order.engine.montecarlo import simulate
from batting_order.engine.states import Kernel

IntArr = NDArray[np.int64]
Objective = Callable[[IntArr], float]


@dataclass
class SearchResult:
    method: str
    order: IntArr
    value: float  # objective as seen by the method (may be noisy)
    evaluations: int
    seconds: float = 0.0
    trace: list[float] = field(default_factory=list)


class CountingObjective:
    """Exact objective with an evaluation counter and memoisation."""

    def __init__(self, kernel: Kernel, m: Matchup) -> None:
        self.kernel, self.m = kernel, m
        self.cache: dict[tuple[int, ...], float] = {}
        self.calls = 0

    def __call__(self, order: IntArr) -> float:
        key = tuple(int(v) for v in order)
        if key not in self.cache:
            self.calls += 1
            self.cache[key] = evaluate(self.kernel, self.m, order).expected_runs
        return self.cache[key]


class NoisyObjective:
    """Monte Carlo objective: mean runs of ``n_sims`` simulated games (fresh seed per call)."""

    def __init__(self, kernel: Kernel, m: Matchup, n_sims: int, seed: int) -> None:
        self.kernel, self.m, self.n_sims = kernel, m, n_sims
        self.rng = np.random.default_rng(seed)
        self.calls = 0

    def __call__(self, order: IntArr) -> float:
        self.calls += 1
        seed = int(self.rng.integers(2**31 - 1))
        return float(simulate(self.kernel, self.m, order, self.n_sims, seed).mean())


# ----------------------------------------------------------------------
# Heuristic orders (no search)
# ----------------------------------------------------------------------


def batter_summaries(m: Matchup, run_values: NDArray[np.float64]) -> dict[str, NDArray[np.float64]]:
    """Per-player on-base probability, power (P(2B)+2P(3B)+3P(HR)) and run value."""
    w0 = m.w.mean(axis=0)
    x = np.einsum("g,gic->ic", w0, m.x)
    obp = x[:, 1] + x[:, 2] + x[:, 3] + x[:, 4] + x[:, 5]
    power = x[:, 3] + 2 * x[:, 4] + 3 * x[:, 5]
    rv = x @ run_values
    return {"obp": obp, "power": power, "rv": rv}


def heuristic_the_book(summ: dict[str, NDArray[np.float64]]) -> IntArr:
    """Tango-Lichtman-Dolphin (2007) guideline, operationalised with model run values.

    The three best hitters bat 1st, 2nd and 4th (highest OBP leads off, most power
    bats 4th); the 4th and 5th best bat 3rd and 5th (more power 5th); the rest bat
    6–9 in decreasing run value.
    """
    rank = list(np.argsort(-summ["rv"]))
    top3, nxt2, rest = rank[:3], rank[3:5], rank[5:]
    lead = max(top3, key=lambda i: summ["obp"][i])
    top3.remove(lead)
    cleanup = max(top3, key=lambda i: summ["power"][i])
    top3.remove(cleanup)
    two = top3[0]
    five = max(nxt2, key=lambda i: summ["power"][i])
    nxt2.remove(five)
    three = nxt2[0]
    return np.array([lead, two, three, cleanup, five, *rest], dtype=np.int64)


def heuristic_sorted(score: NDArray[np.float64]) -> IntArr:
    return np.argsort(-score).astype(np.int64)


# ----------------------------------------------------------------------
# Search methods
# ----------------------------------------------------------------------


def local_search(f: Objective, start: IntArr, max_rounds: int = 100) -> SearchResult:
    """Best-improvement 2-swap hill climbing (36 neighbours per round)."""
    cur = start.copy()
    best = f(cur)
    trace = [best]
    for _ in range(max_rounds):
        improved = False
        cand_best, cand_order = best, None
        for i in range(9):
            for j in range(i + 1, 9):
                nb_ = cur.copy()
                nb_[i], nb_[j] = nb_[j], nb_[i]
                v = f(nb_)
                if v > cand_best + 1e-15:
                    cand_best, cand_order = v, nb_
        if cand_order is not None:
            cur, best, improved = cand_order, cand_best, True
            trace.append(best)
        if not improved:
            break
    return SearchResult("local_search", cur, best, 0, trace=trace)


def multistart_local_search(
    f: Objective, rng: np.random.Generator, starts: int = 10, first: IntArr | None = None
) -> SearchResult:
    best: SearchResult | None = None
    for k in range(starts):
        s = first if (k == 0 and first is not None) else rng.permutation(9).astype(np.int64)
        r = local_search(f, s)
        if best is None or r.value > best.value:
            best = r
    assert best is not None
    best.method = f"local_search_x{starts}"
    return best


def simulated_annealing(
    f: Objective,
    rng: np.random.Generator,
    start: IntArr,
    iters: int = 3000,
    t0: float = 0.02,
    t1: float = 1e-4,
) -> SearchResult:
    """Swap-move simulated annealing with geometric cooling."""
    cur = start.copy()
    fc = f(cur)
    best, fb = cur.copy(), fc
    trace = [fb]
    for it in range(iters):
        t = t0 * (t1 / t0) ** (it / max(iters - 1, 1))
        i, j = rng.choice(9, size=2, replace=False)
        nb_ = cur.copy()
        nb_[i], nb_[j] = nb_[j], nb_[i]
        fn = f(nb_)
        if fn >= fc or rng.random() < np.exp((fn - fc) / t):
            cur, fc = nb_, fn
            if fc > fb:
                best, fb = cur.copy(), fc
        if it % 100 == 0:
            trace.append(fb)
    return SearchResult("simulated_annealing", best, fb, 0, trace=trace)


def _ox(p1: IntArr, p2: IntArr, rng: np.random.Generator) -> IntArr:
    """Ordered crossover (OX1)."""
    a, b = sorted(rng.choice(10, size=2, replace=False))
    child = -np.ones(9, dtype=np.int64)
    child[a:b] = p1[a:b]
    fill = [g for g in p2 if g not in child[a:b]]
    idx = [i for i in range(9) if child[i] < 0]
    child[idx] = fill
    return child


def genetic(
    f: Objective,
    rng: np.random.Generator,
    pop: int = 60,
    gens: int = 30,
    cx: float = 0.8,
    mut: float = 0.3,
    indpb: float = 0.2,
    tourn: int = 3,
    elite: int = 5,
    seeds: list[IntArr] | None = None,
) -> SearchResult:
    """Generational GA mirroring the original project's operators and defaults.

    Ordered crossover, per-gene swap mutation, tournament selection and elitism.
    With a noisy ``f`` the returned value is the noisy estimate of the chosen order.
    """
    P = [s.copy() for s in (seeds or [])][:pop]
    while len(P) < pop:
        P.append(rng.permutation(9).astype(np.int64))
    fit = [f(p) for p in P]
    trace = [max(fit)]
    for _ in range(gens):
        order_idx = np.argsort(fit)[::-1]
        new = [P[i].copy() for i in order_idx[:elite]]
        new_fit = [fit[i] for i in order_idx[:elite]]
        while len(new) < pop:
            parents = []
            for _ in range(2):
                cand = rng.choice(pop, size=tourn, replace=False)
                parents.append(P[max(cand, key=lambda i: fit[i])])
            child = _ox(parents[0], parents[1], rng) if rng.random() < cx else parents[0].copy()
            if rng.random() < mut:
                for i in range(9):
                    if rng.random() < indpb:
                        j = int(rng.integers(9))
                        child[i], child[j] = child[j], child[i]
            new.append(child)
            new_fit.append(f(child))
        P, fit = new, new_fit
        trace.append(max(fit))
    i = int(np.argmax(fit))
    return SearchResult("genetic", P[i], fit[i], 0, trace=trace)


def exhaustive_search(
    kernel: Kernel, m: Matchup, allowed: NDArray[np.bool_] | None = None
) -> SearchResult:
    res = exhaustive(kernel, m)
    order, val = res.best(allowed)
    return SearchResult("exhaustive", order, val, 362_880)
