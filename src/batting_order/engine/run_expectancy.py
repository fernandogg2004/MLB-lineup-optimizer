"""Run expectancy (RE24) and linear-weight run values implied by a kernel.

With every batter drawn from the same outcome distribution ``x`` the half-inning
is an absorbing chain on the 24 base-out states with transient matrix
``Q = sum_c x_c P_c[:, :24]`` and reward ``rho = sum_c x_c R_c``. The run
expectancy vector is the unique solution of ``(I - Q) RE = rho`` (paper,
Proposition 2). The run value of outcome ``c`` is its average change in run
expectancy, weighted by how often each state is visited:

    RV(c) = sum_s nu(s) [R_c(s) + sum_s' P_c(s, s') RE(s') - RE(s)] / sum_s nu(s),

where ``nu = e_0^T (I - Q)^{-1}`` counts expected visits starting from 0 out, empty.
"""

from __future__ import annotations

import numpy as np
from numpy.typing import NDArray

from batting_order.engine.states import N_STATES, Kernel

FloatArr = NDArray[np.float64]


def run_expectancy(kernel: Kernel, x: FloatArr) -> FloatArr:
    P, R = kernel.P, kernel.R
    Q = np.einsum("c,csn->sn", x, P)[:, :N_STATES]
    rho = x @ R
    return np.linalg.solve(np.eye(N_STATES) - Q, rho)


def run_values(kernel: Kernel, x: FloatArr) -> FloatArr:
    P, R = kernel.P, kernel.R
    Q = np.einsum("c,csn->sn", x, P)[:, :N_STATES]
    re = np.linalg.solve(np.eye(N_STATES) - Q, x @ R)
    e0 = np.zeros(N_STATES)
    e0[0] = 1.0
    nu = np.linalg.solve((np.eye(N_STATES) - Q).T, e0)
    re_ext = np.append(re, 0.0)  # absorbing state has zero expectancy
    delta = R + np.einsum("csn,n->cs", P, re_ext) - re[None, :]
    return np.asarray((delta @ nu) / nu.sum(), dtype=np.float64)
