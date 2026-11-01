"""Run the ORIGINAL project's PA model on its own stored 2026 features (experiment E2, legacy).

Must be executed with the original environment and the baseline worktree on sys.path:

    git worktree add ../mlb-baseline-wt baseline/pre-rebuild   (GIT_LFS_SKIP_SMUDGE=1)
    <old-venv>/python scripts/legacy_pa_predictions.py ../mlb-baseline-wt \
        data/gold/features_train_v3.parquet models/at_bat_predictor.pkl work/legacy_2026.parquet

The legacy model was trained on seasons <= 2024 and calibrated on 2025, so its 2026
predictions are out of sample. Rows keep their original order; a within-(batter, pitcher,
date) sequence number is added for alignment with the new PA table.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import polars as pl

LEAKING = {"xwoba", "launch_speed", "launch_angle", "pitch_count_in_pa", "last_pitch_type"}
NON_FEATURES = {"pa_outcome_idx", "season", "game_date", "batter_id", "pitcher_id"}


def main() -> None:
    worktree, gold, model_path, out = map(Path, sys.argv[1:5])
    sys.path.insert(0, str(worktree.resolve()))
    from src.models.model_at_bat import AtBatPredictor  # type: ignore[import-not-found]

    df = pl.read_parquet(gold).filter(pl.col("season") == 2026)
    cols = [c for c in df.columns if c not in NON_FEATURES | LEAKING]
    model = AtBatPredictor.load(str(model_path))
    probs = model.predict_proba(df.select(cols).to_numpy().astype(np.float32))
    res = df.select(["batter_id", "pitcher_id", "game_date", "pa_outcome_idx"]).with_columns(
        pl.int_range(pl.len()).over(["batter_id", "pitcher_id", "game_date"]).alias("seq"),
        *[pl.Series(f"p{k}", probs[:, k]) for k in range(probs.shape[1])],
    )
    res.write_parquet(out)
    print(out, res.shape, "features", len(cols))


if __name__ == "__main__":
    main()
