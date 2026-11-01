"""Correctness of the exact Markov-chain evaluator and exhaustive search."""

from __future__ import annotations

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from batting_order.engine.markov import (
    Matchup,
    _cycle_index,
    cyclic_orders,
    evaluate,
    exhaustive,
    run_distribution,
)
from batting_order.engine.states import (
    ABSORB,
    AIR,
    HR,
    MAX_RUNS_PER_PA,
    N_NEXT,
    N_OUT,
    N_STATES,
    K,
    Kernel,
    conservation_ok,
    decode,
    deterministic_kernel,
)

DET = deterministic_kernel()


def _probs(rng: np.random.Generator, n: int = 9) -> np.ndarray:
    base = np.array([0.22, 0.09, 0.14, 0.045, 0.004, 0.03, 0.21, 0.26])
    x = rng.dirichlet(base * 200, size=n)
    return x


def random_kernel(rng: np.random.Generator) -> Kernel:
    """A random kernel that respects run/out bookkeeping (mixture of plausible plays)."""
    J = np.zeros((N_OUT, N_STATES, N_NEXT, MAX_RUNS_PER_PA + 1))
    det = DET.J
    for c in range(N_OUT):
        for s in range(N_STATES):
            # mix the deterministic play with "everyone advances one more base" variants
            J[c, s] += 0.7 * det[c, s]
            outs, b = decode(s)
            alt = _extra_base(c, outs, b)
            J[c, s, alt[0], alt[1]] += 0.3
    return Kernel(J, label="random")


def _extra_base(c: int, outs: int, b: int) -> tuple[int, int]:
    from batting_order.engine.states import deterministic_transition, state_index

    s2, r = deterministic_transition(c, state_index(outs, b))
    if s2 == ABSORB or c in (K,):
        return s2, r
    o2, b2 = decode(s2)
    # push the lead runner on 2nd home when possible (keeps bookkeeping exact)
    if b2 & 2 and not b2 & 4:
        return state_index(o2, (b2 & ~2) | 4), r
    if b2 & 4:
        return state_index(o2, b2 & ~4), r + 1
    return s2, r


def test_deterministic_kernel_conserves_participants() -> None:
    J = DET.J
    for c in range(N_OUT):
        for s in range(N_STATES):
            for s2 in range(N_NEXT):
                for r in range(MAX_RUNS_PER_PA + 1):
                    if J[c, s, s2, r] > 0:
                        assert conservation_ok(s, s2, r), (c, s, s2, r)


def test_all_strikeouts_score_zero_and_cycle_leadoffs() -> None:
    x = np.zeros((9, N_OUT))
    x[:, K] = 1.0
    ev = evaluate(DET, Matchup.single_regime(x), list(range(9)))
    assert ev.expected_runs == 0.0
    # 27 PAs, 3 per slot
    np.testing.assert_allclose(ev.pa_by_slot, np.full(9, 3.0))


@pytest.mark.parametrize("q", [0.5, 0.7, 0.9])
def test_out_or_homer_closed_form(q: float) -> None:
    """Out w.p. q, HR w.p. 1-q: runs per inning are NegBin(3, q) -> 3(1-q)/q."""
    x = np.zeros((9, N_OUT))
    x[:, AIR] = q
    x[:, HR] = 1 - q
    ev = evaluate(DET, Matchup.single_regime(x), list(range(9)))
    assert ev.expected_runs == pytest.approx(27 * (1 - q) / q, rel=1e-10)
    assert ev.truncated_mass < 1e-12


def test_identical_hitters_make_order_irrelevant() -> None:
    rng = np.random.default_rng(0)
    x = np.tile(_probs(rng, 1), (9, 1))
    m = Matchup.single_regime(x)
    vals = [evaluate(DET, m, rng.permutation(9)).expected_runs for _ in range(5)]
    assert np.ptp(vals) < 1e-12


def _simulate(
    kernel: Kernel, m: Matchup, order: np.ndarray, n: int, rng: np.random.Generator
) -> np.ndarray:
    """Independent reference Monte Carlo implementation (plain Python)."""
    J = kernel.J.reshape(N_OUT, N_STATES, -1)
    cumJ = J.cumsum(axis=2)
    runs = np.zeros(n)
    for g_i in range(n):
        slot = 0
        total = 0
        for k in range(9):
            g = rng.choice(m.w.shape[1], p=m.w[k])
            s = 0
            while s != ABSORB:
                c = rng.choice(N_OUT, p=m.x[g, order[slot]])
                idx = int(np.searchsorted(cumJ[c, s], rng.random(), side="right"))
                idx = min(idx, cumJ.shape[2] - 1)
                s, r = divmod(idx, MAX_RUNS_PER_PA + 1)
                total += r
                slot = (slot + 1) % 9
        runs[g_i] = total
    return runs


@pytest.mark.slow
def test_exact_matches_independent_monte_carlo() -> None:
    rng = np.random.default_rng(1)
    kernel = random_kernel(rng)
    x = np.stack([_probs(rng), _probs(rng)])
    w = np.zeros((9, 2))
    w[:6, 0] = 1.0
    w[6:, 1] = 1.0
    w[5] = [0.5, 0.5]
    m = Matchup(x, w)
    order = rng.permutation(9)
    exact = evaluate(kernel, m, order).expected_runs
    sims = _simulate(kernel, m, order, 20_000, rng)
    se = sims.std(ddof=1) / np.sqrt(len(sims))
    assert abs(sims.mean() - exact) < 4 * se, (exact, sims.mean(), se)
    dist = run_distribution(kernel, m, order)
    assert dist @ np.arange(len(dist)) == pytest.approx(exact, abs=1e-6)
    emp = np.bincount(sims.astype(int), minlength=len(dist))[: len(dist)] / len(sims)
    assert np.abs(np.cumsum(emp) - np.cumsum(dist)).max() < 0.02  # KS-type check


def test_distribution_mean_equals_exact_mean() -> None:
    rng = np.random.default_rng(2)
    m = Matchup.single_regime(_probs(rng))
    order = np.arange(9)
    dist = run_distribution(DET, m, order)
    assert dist.sum() == pytest.approx(1.0)
    assert dist @ np.arange(len(dist)) == pytest.approx(
        evaluate(DET, m, order).expected_runs, abs=1e-8
    )


def test_cycle_index_is_a_bijection() -> None:
    cyc = cyclic_orders()
    assert cyc.shape == (40320, 9)
    for i in [0, 1, 777, 40319]:
        assert _cycle_index(cyc[i]) == i


@pytest.mark.slow
def test_exhaustive_agrees_with_direct_evaluation_and_brute_max() -> None:
    rng = np.random.default_rng(3)
    m = Matchup.single_regime(_probs(rng))
    res = exhaustive(DET, m)
    assert res.values.shape == (40320, 9)
    for _ in range(20):
        o = rng.permutation(9)
        assert res.value_of(o) == pytest.approx(evaluate(DET, m, o).expected_runs, abs=1e-12)
    best, val = res.best()
    assert val == pytest.approx(res.values.max())
    assert evaluate(DET, m, best).expected_runs == pytest.approx(val, abs=1e-12)


@pytest.mark.slow
def test_constrained_best_respects_locks() -> None:
    rng = np.random.default_rng(4)
    m = Matchup.single_regime(_probs(rng))
    res = exhaustive(DET, m)
    allowed = np.ones((9, 9), dtype=bool)
    allowed[0, :] = False
    allowed[0, 5] = True  # player 5 must lead off
    allowed[:, 5] = False
    allowed[0, 5] = True
    best, val = res.best(allowed)
    assert best[0] == 5
    assert val <= res.values.max() + 1e-15


@settings(max_examples=25, deadline=None)
@given(st.integers(min_value=0, max_value=10_000))
def test_expected_runs_finite_nonnegative_and_pa_total(seed: int) -> None:
    rng = np.random.default_rng(seed)
    m = Matchup.single_regime(_probs(rng))
    ev = evaluate(DET, m, rng.permutation(9))
    assert np.isfinite(ev.expected_runs) and ev.expected_runs >= 0
    # PAs are non-increasing down the order and total = 27 + baserunners-not-out
    assert np.all(np.diff(ev.pa_by_slot) <= 1e-12)
    assert ev.pa_by_slot.sum() >= 27 - 1e-9


def test_invalid_inputs_rejected() -> None:
    with pytest.raises(ValueError):
        Matchup.single_regime(np.ones((9, N_OUT)))
    rng = np.random.default_rng(5)
    m = Matchup.single_regime(_probs(rng))
    with pytest.raises(ValueError):
        evaluate(DET, m, [0, 0, 1, 2, 3, 4, 5, 6, 7])


def test_truncation_bound_holds_against_loose_tolerance() -> None:
    """Evaluate with a coarse tolerance and check the error against Proposition 3."""
    from batting_order.engine.markov import out_probability_floor, truncation_error_bound

    rng = np.random.default_rng(11)
    kernel = random_kernel(rng)
    m = Matchup.single_regime(_probs(rng))
    order = rng.permutation(9)
    exact = evaluate(kernel, m, order, tol=1e-15).expected_runs
    q = out_probability_floor(kernel, m)
    assert 0 < q < 1
    for tol in (1e-2, 1e-4, 1e-6):
        ev = evaluate(kernel, m, order, tol=tol)
        assert abs(exact - ev.expected_runs) <= truncation_error_bound(q, ev.truncated_mass) + 1e-15


def test_runs_never_exceed_plate_appearances_minus_three() -> None:
    """Bookkeeping identity R + LOB + 3 = N implies E[R_inning] <= E[N] - 3."""
    rng = np.random.default_rng(12)
    m = Matchup.single_regime(_probs(rng))
    ev = evaluate(DET, m, np.arange(9))
    assert ev.expected_runs <= ev.pa_by_slot.sum() - 27 + 1e-9
