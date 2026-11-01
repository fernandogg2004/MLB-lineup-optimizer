"""Build processed tables from immutable raw data.

``data/raw/statcast/season=YYYY/*.parquet``  ->  ``data/processed/transitions_YYYY.parquet``
                                               ``data/processed/lineups_YYYY.parquet``
                                               ``data/processed/quality_YYYY.json``

Processing is deterministic and idempotent: identical raw files give identical
outputs. Venue identifiers are attached from the cached StatsAPI schedule.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import polars as pl

from batting_order.data.plate_appearances import (
    data_quality,
    decisive_rows,
    starting_lineups,
    transitions,
)
from batting_order.data.statcast import read_season
from batting_order.data.statsapi import StatsApi

log = logging.getLogger(__name__)


def venues(api: StatsApi, season: int) -> pl.DataFrame:
    rows = [
        {
            "game_pk": int(g["gamePk"]),
            "venue_id": int(g["venue"]["id"]),
            "venue": g["venue"]["name"],
        }
        for g in api.schedule(season)
    ]
    return pl.DataFrame(rows).unique("game_pk")


def build_season(season: int, data_root: Path, api: StatsApi) -> dict[str, object]:
    raw = read_season(data_root / "raw" / "statcast", season)
    pa = transitions(decisive_rows(raw))
    v = venues(api, season)
    pa = pa.join(v, on="game_pk", how="left")
    out = data_root / "processed"
    out.mkdir(parents=True, exist_ok=True)
    pa.write_parquet(out / f"transitions_{season}.parquet")
    lu = starting_lineups(pa).join(v, on="game_pk", how="left")
    lu.write_parquet(out / f"lineups_{season}.parquet")
    q = data_quality(pa) | {
        "games": int(pa["game_pk"].n_unique()),
        "lineups": lu.height,
        "lineups_reliable": int(lu["reliable"].sum()),
        "missing_venue": int(pa["venue_id"].is_null().sum()),
        "first_date": str(pa["game_date"].min()),
        "last_date": str(pa["game_date"].max()),
    }
    (out / f"quality_{season}.json").write_text(json.dumps(q, indent=1))
    log.info("season %d: %s", season, q)
    return q


def load_transitions(data_root: Path, seasons: list[int]) -> pl.DataFrame:
    frames = [
        pl.read_parquet(data_root / "processed" / f"transitions_{s}.parquet") for s in seasons
    ]
    return pl.concat(frames, how="diagonal_relaxed")


def load_lineups(data_root: Path, seasons: list[int]) -> pl.DataFrame:
    frames = [pl.read_parquet(data_root / "processed" / f"lineups_{s}.parquet") for s in seasons]
    return pl.concat(frames, how="diagonal_relaxed")
