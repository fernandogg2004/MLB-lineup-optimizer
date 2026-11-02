"""Export reference vectors that the TypeScript evaluator must reproduce exactly."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import polars as pl

from batting_order.engine.markov import Matchup, evaluate, exhaustive
from batting_order.engine.states import deterministic_kernel
from batting_order.model.kernel import fit_kernel

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    pa_path = ROOT / "data" / "processed" / "transitions_2026.parquet"
    kernel = (
        fit_kernel(pl.read_parquet(pa_path), date(2026, 10, 1), date(2026, 3, 1))
        if pa_path.exists()
        else deterministic_kernel()
    )
    rng = np.random.default_rng(2026)
    base = np.array([0.22, 0.09, 0.14, 0.045, 0.004, 0.03, 0.21, 0.26])
    x = rng.dirichlet(base * 150, size=(2, 9))
    w = np.zeros((9, 2))
    w[:, 0] = [1, 0.97, 0.93, 0.89, 0.76, 0.45, 0.14, 0.03, 0.0]
    w[:, 1] = 1 - w[:, 0]
    m = Matchup(x, w)
    orders = [list(range(9))] + [rng.permutation(9).tolist() for _ in range(4)]
    evals = [evaluate(kernel, m, o) for o in orders]
    ex = exhaustive(kernel, m)
    best, val = ex.best()
    out = {
        "kernel": {"P": kernel.P.ravel().tolist(), "R": kernel.R.ravel().tolist()},
        "matchup": {"G": 2, "x": x.ravel().tolist(), "w": w.ravel().tolist()},
        "orders": orders,
        "expected": [e.expected_runs for e in evals],
        "byInning": [e.runs_by_inning.tolist() for e in evals],
        "best": [int(v) for v in best],
        "bestValue": val,
        "min": float(ex.values.min()),
    }
    dest = ROOT / "web" / "src" / "engine" / "fixtures" / "vectors.json"
    dest.write_text(json.dumps(out))
    print("wrote", dest, "best", best, val)


if __name__ == "__main__":
    main()
