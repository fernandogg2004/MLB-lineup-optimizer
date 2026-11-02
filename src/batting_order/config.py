"""Project-level configuration shared by the CLI, snapshots and experiments.

The project directory is resolved at run time, never from the installed package's location,
so that non-editable installs (CI, Docker) read and write the checkout they run in.
"""

from __future__ import annotations

import json
import logging
import os
from pathlib import Path

from batting_order.model.pa_model import Hyper

log = logging.getLogger(__name__)
REFERENCE_GAME = 849799  # 2026 World Series Game 5 (MIL 4 @ TB 1, 2026-10-28)


def _is_project(p: Path) -> bool:
    py = p / "pyproject.toml"
    return py.is_file() and 'name = "batting-order"' in py.read_text(encoding="utf-8")


def project_root() -> Path:
    """``$BATTING_ORDER_ROOT`` if set, else the nearest ancestor of the CWD holding the project.

    Raises:
        FileNotFoundError: if no project directory can be found.
    """
    env = os.environ.get("BATTING_ORDER_ROOT")
    if env:
        p = Path(env).resolve()
        if not _is_project(p):
            raise FileNotFoundError(f"BATTING_ORDER_ROOT={p} is not the batting-order project")
        return p
    for p in [Path.cwd().resolve(), *Path.cwd().resolve().parents]:
        if _is_project(p):
            return p
    raise FileNotFoundError("run from inside the batting-order checkout or set BATTING_ORDER_ROOT")


def tuned_hyper(root: Path | None = None) -> tuple[Hyper, str]:
    """Hyperparameters selected by experiment E2 (``outputs/e2_tuning.json``).

    Returns the hyperparameters and their source, which snapshots record. Falls back to
    ``Hyper()`` (and says so) only when the tuning output does not exist.
    """
    path = (root or project_root()) / "outputs" / "e2_tuning.json"
    if not path.exists():
        log.warning("outputs/e2_tuning.json not found; using untuned default hyperparameters")
        return Hyper(), "default (untuned)"
    sel = json.loads(path.read_text(encoding="utf-8"))["selected"]
    h = Hyper(
        batter_scale=sel["batter_scale"],
        pitcher_scale=sel["pitcher_scale"],
        half_life_days=sel["half_life_days"],
    )
    return h, "outputs/e2_tuning.json"
