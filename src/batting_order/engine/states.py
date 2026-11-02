"""Base-out state space, plate-appearance outcome classes and transition kernels.

Notation (matches ``research/paper.tex``):

* A transient state is ``s = 8 * outs + bases`` with ``outs in {0, 1, 2}`` and
  ``bases`` a 3-bit mask (bit 0 = runner on 1st, bit 1 = 2nd, bit 2 = 3rd), so
  ``s in {0, ..., 23}``. Index ``ABSORB = 24`` is the three-out (inning over) state.
* Outcome classes ``c in {0, ..., 7}`` are the batter-specific part of a plate
  appearance (PA): K, BB (walk, intentional walk, hit-by-pitch, catcher's
  interference), 1B, 2B, 3B, HR, GB (ground ball not recorded as a hit, which
  includes double plays, fielder's choices and reached-on-error) and AIR (fly ball,
  line drive or pop-up not recorded as a hit, which includes sacrifice flies).
* A transition kernel ``J[c, s, s', r]`` is the probability that, from state ``s``,
  a PA with outcome ``c`` -- together with all base-running events up to the
  decisive pitch of the next PA -- leads to state ``s'`` with ``r`` runs scored.
  It does not depend on the batter's identity (assumption A3 in the paper).
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
from numpy.typing import NDArray

OUTCOMES: tuple[str, ...] = ("K", "BB", "1B", "2B", "3B", "HR", "GB", "AIR")
N_OUT = len(OUTCOMES)
K, BB, S1, S2, S3, HR, GB, AIR = range(N_OUT)
N_STATES = 24
ABSORB = 24
N_NEXT = 25
MAX_RUNS_PER_PA = 4  # at most 3 runners + batter can score on one PA

FloatArr = NDArray[np.float64]


def state_index(outs: int, bases: int) -> int:
    if not (0 <= outs <= 2 and 0 <= bases <= 7):
        raise ValueError(f"invalid base-out state outs={outs} bases={bases}")
    return 8 * outs + bases


def runners(bases: int) -> int:
    return int(bases & 1) + int((bases >> 1) & 1) + int((bases >> 2) & 1)


def decode(s: int) -> tuple[int, int]:
    """Return ``(outs, bases)`` for a transient state, ``(3, 0)`` for ``ABSORB``."""
    if s == ABSORB:
        return 3, 0
    return s // 8, s % 8


@dataclass(frozen=True)
class Kernel:
    """Batter-independent transition kernel ``J[c, s, s', r]``.

    ``J`` has shape ``(8, 24, 25, 5)`` and every slice ``J[c, s]`` sums to one.
    """

    J: FloatArr
    label: str = "kernel"
    meta: dict[str, object] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.J.shape != (N_OUT, N_STATES, N_NEXT, MAX_RUNS_PER_PA + 1):
            raise ValueError(f"kernel has shape {self.J.shape}")
        if not np.all(np.isfinite(self.J)) or np.any(self.J < 0):
            raise ValueError("kernel has negative or non-finite entries")
        P = self.J.sum(axis=3)
        for s in range(N_STATES):
            o = s // 8
            if P[:, s, : 8 * o].sum() > 0:
                raise ValueError(f"kernel decreases outs from state {s} (assumption A4)")
        sums = self.J.sum(axis=(2, 3))
        if not np.allclose(sums, 1.0, atol=1e-9):
            raise ValueError(
                f"kernel rows do not sum to one (max dev {np.abs(sums - 1).max():.2e})"
            )

    @property
    def P(self) -> FloatArr:
        """Marginal next-state probabilities, shape ``(8, 24, 25)``."""
        return np.asarray(self.J.sum(axis=3), dtype=np.float64)

    @property
    def R(self) -> FloatArr:
        """Expected runs per transition, shape ``(8, 24)``."""
        r = np.arange(MAX_RUNS_PER_PA + 1, dtype=np.float64)
        return np.asarray((self.J * r).sum(axis=(2, 3)), dtype=np.float64)


def _apply(outs: int, bases: int, add_outs: int, new_bases: int, runs: int) -> tuple[int, int]:
    """Map a deterministic play to ``(next_state, runs)``; runs after the third out are void."""
    o = outs + add_outs
    if o >= 3:
        return ABSORB, 0
    return state_index(o, new_bases), runs


def deterministic_transition(c: int, s: int) -> tuple[int, int]:
    """Conventional textbook advancement used as a smoothing prior and in tests.

    Singles advance every runner one base; doubles score runners from second and
    third and move a runner on first to third; ground balls with a runner on first
    and fewer than two outs are double plays; other outs do not move runners.
    """
    outs, b = decode(s)
    b1, b2, b3 = b & 1, (b >> 1) & 1, (b >> 2) & 1
    if c in (K, AIR):
        return _apply(outs, b, 1, b, 0)
    if c == BB:
        if b1 and b2 and b3:
            return _apply(outs, b, 0, 7, 1)
        nb = b | 1
        if b1:
            nb |= 2
            if b2:
                nb |= 4
        return _apply(outs, b, 0, nb, 0)
    if c == S1:
        return _apply(outs, b, 0, 1 | (b1 << 1) | (b2 << 2), b3)
    if c == S2:
        return _apply(outs, b, 0, 2 | (b1 << 2), b2 + b3)
    if c == S3:
        return _apply(outs, b, 0, 4, b1 + b2 + b3)
    if c == HR:
        return _apply(outs, b, 0, 0, 1 + b1 + b2 + b3)
    if c == GB:
        if b1 and outs < 2:
            return _apply(outs, b, 2, b & 0b110, 0)
        return _apply(outs, b, 1, b, 0)
    raise ValueError(f"unknown outcome {c}")


def deterministic_kernel() -> Kernel:
    J = np.zeros((N_OUT, N_STATES, N_NEXT, MAX_RUNS_PER_PA + 1))
    for c in range(N_OUT):
        for s in range(N_STATES):
            s2, r = deterministic_transition(c, s)
            J[c, s, s2, r] = 1.0
    return Kernel(J, label="deterministic")


def conservation_ok(s: int, s2: int, r: int) -> bool:
    """Bookkeeping identity for one transition (batter + runners are conserved).

    For a non-absorbing transition every one of the ``runners(s) + 1`` participants
    (runners plus the batter) is on base, has scored or has been put out:
    ``runners(s) + 1 == runners(s') + r + (outs' - outs)``. When the inning ends,
    runners may be left on base, so only ``r + (3 - outs) <= runners(s) + 1`` holds.

    Transitions also absorb base-running events (steals, pick-offs, wild pitches)
    that occur before the next decisive pitch; those move existing runners only and
    keep the identity intact, except that a pick-off or caught stealing removes a
    runner and adds an out, which also preserves it.
    """
    o1, b1 = decode(s)
    o2, b2 = decode(s2)
    before = runners(b1) + 1
    if s2 == ABSORB:
        return r + (3 - o1) <= before
    return before == runners(b2) + r + (o2 - o1)
