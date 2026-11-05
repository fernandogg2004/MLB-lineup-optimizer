"""Official hitting lines, percentiles and the Home-page data files."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import polars as pl
import pytest

from batting_order.batter_stats import (
    MIN_PA,
    MIN_POOL,
    batting_line,
    build_home,
    fetch_hitting,
    hitting_params,
    hitting_window,
    percentile,
    rate,
)
from batting_order.config import REFERENCE_GAME, project_root
from batting_order.data.statsapi import StatsApi, starting_position


def _split(
    pid: int, pa: int, avg: str = ".250", obp: str = ".320", slg: str = ".400", ops: str = ".720"
) -> dict[str, Any]:
    return {
        "player": {"id": pid},
        "stat": {"plateAppearances": pa, "avg": avg, "obp": obp, "slg": slg, "ops": ops},
    }


class FakeApi:
    def __init__(self, by_season: dict[int, list[dict[str, Any]]]) -> None:
        self.by_season = by_season
        self.calls: list[dict[str, str]] = []

    def get(
        self, path: str, params: dict[str, str] | None = None, refresh: bool = False
    ) -> dict[str, Any]:
        assert path == "stats" and params is not None
        self.calls.append(params)
        return {"stats": [{"splits": self.by_season.get(int(params["season"]), [])}]}


def _full_pool(n: int = MIN_POOL) -> list[dict[str, Any]]:
    return [_split(1000 + i, MIN_PA, avg=f".{200 + i:03d}") for i in range(n)]


def test_percentile_is_the_share_strictly_below() -> None:
    assert percentile([0.1, 0.2, 0.3, 0.4], 0.35) == 75
    assert percentile([0.1, 0.2, 0.3, 0.4], 0.3) == 50  # ties do not count as below


def test_percentile_is_clamped_to_1_99() -> None:
    assert percentile([0.1, 0.2], 0.05) == 1
    assert percentile([0.1, 0.2], 0.9) == 99
    with pytest.raises(ValueError, match="empty"):
        percentile([], 0.1)


def test_rate_reads_published_strings() -> None:
    assert rate(".268") == pytest.approx(0.268)
    assert rate("1.000") == 1.0
    assert rate(".---") is None
    assert rate(None) is None


def test_duplicate_rows_keep_the_larger_one() -> None:
    api = FakeApi(
        {2026: [_split(7, 100, avg=".100"), _split(7, 300, avg=".300"), _split(7, 200, avg=".200")]}
    )
    assert fetch_hitting(api, 2026, date(2026, 9, 1))[7]["avg"] == ".300"


def test_request_never_reaches_the_game_date() -> None:
    assert hitting_params(2026, date(2026, 6, 30))["endDate"] == "2026-06-30"
    api = FakeApi({2026: _full_pool()})
    _, _, meta = hitting_window(api, date(2026, 7, 1))
    assert api.calls[0]["endDate"] == "2026-06-30"
    assert meta["end"] == "2026-06-30"
    assert not meta["previous_season"]


def test_small_pool_falls_back_to_previous_full_season() -> None:
    api = FakeApi({2026: _full_pool(MIN_POOL - 1), 2025: _full_pool(MIN_POOL + 5)})
    rows, pool, meta = hitting_window(api, date(2026, 4, 10))
    assert meta["previous_season"] is True
    assert meta["season"] == 2025
    assert meta["end"] == "2025-12-31"
    assert len(pool) == meta["pool_size"] == MIN_POOL + 5
    assert 1000 in rows


def test_no_usable_pool_is_an_error() -> None:
    with pytest.raises(ValueError, match="qualifying"):
        hitting_window(FakeApi({2026: [], 2025: []}), date(2026, 4, 10))


def test_line_marks_small_samples_and_missing_values() -> None:
    pool = [_split(i, MIN_PA, avg=f".{100 + i}")["stat"] for i in range(100, 200)]
    rows = {1: _split(1, MIN_PA - 1, avg=".250", ops=".---")["stat"]}
    line = batting_line(1, rows, pool)
    assert line["small_sample"] is True
    assert line["rates"]["avg"] == ".250"
    assert line["pct"]["avg"] == 50
    assert line["rates"]["ops"] is None and line["pct"]["ops"] is None
    absent = batting_line(2, rows, pool)
    assert absent["pa"] == 0 and absent["small_sample"] is True and absent["pct"]["avg"] is None


# --- Files published for the dashboard --------------------------------------------------------


def _web_data() -> Path:
    return project_root() / "web" / "public" / "data"


def _published() -> list[tuple[dict[str, Any], dict[str, Any]]]:
    out = []
    for p in sorted((_web_data() / "games").glob("*.json")):
        home = _web_data() / "home" / p.name
        assert home.exists(), f"missing Home data for game {p.stem}; run `batting-order home`"
        out.append((json.loads(p.read_text("utf-8")), json.loads(home.read_text("utf-8"))))
    return out


def test_home_files_copy_the_snapshot_exactly() -> None:
    games = _published()
    assert games
    for snap, home in games:
        assert home["game"]["game_pk"] == snap["game"]["game_pk"]
        for side in ("away", "home"):
            s, h = snap["teams"][side], home["teams"][side]
            assert h["team"] == s["team"]
            assert h["opponent_starter"]["name"] == s["opponent_starter"]["name"]
            assert h["actual"] == {
                "er9": s["actual"]["er9"],
                "percentile": s["actual"]["percentile"],
            }
            assert h["worst"]["er9"] == s["worst"]["er9"]
            assert h["all_orders"]["count"] == s["all_orders"]["count"]
            for k in ("order", "er9", "pa_by_slot", "run_distribution"):
                assert h["optimal"][k] == s["optimal"][k], k
            assert h["uncertainty"]["p_opt_better"] == s["uncertainty"]["p_opt_better"]
            assert h["uncertainty"]["diff_q05"] == s["uncertainty"]["diff_q05"]
            for hh, sh in zip(h["hitters"], s["hitters"], strict=True):
                for k in ("id", "name", "slot", "probs_starter", "probs_bullpen"):
                    assert hh[k] == sh[k], k


def test_home_files_exclude_draws_and_use_only_earlier_data() -> None:
    for snap, home in _published():
        raw = json.dumps(home)
        assert "draws_x" not in raw
        assert home["hitting"]["end"] < snap["game"]["date"]


def test_rebuilding_home_data_is_reproducible() -> None:
    """A rebuild from the same cached API responses gives the same result (skips without them)."""
    snap = json.loads((_web_data() / "games" / f"{REFERENCE_GAME}.json").read_text("utf-8"))
    api = StatsApi(project_root() / "data" / "raw" / "statsapi", offline=True)
    try:
        rebuilt = build_home(snap, api)
    except FileNotFoundError:
        pytest.skip("official hitting response not cached locally")
    published = json.loads((_web_data() / "home" / f"{REFERENCE_GAME}.json").read_text("utf-8"))
    assert rebuilt == published


def test_lineups_have_no_duplicate_fielding_positions() -> None:
    """A player who changed position mid-game must appear where he started it."""
    for _, home in _published():
        for team in home["teams"].values():
            positions = [h["pos"] for h in team["hitters"]]
            assert len(set(positions)) == 9, (home["game"]["game_pk"], team["team"], positions)


def test_starting_position_is_the_first_one_played() -> None:
    switched = {
        "position": {"abbreviation": "SS"},
        "allPositions": [{"abbreviation": "2B"}, {"abbreviation": "SS"}],
    }
    assert starting_position(switched) == "2B"
    assert starting_position({"position": {"abbreviation": "C"}}) == "C"


def test_reference_values_for_turang() -> None:
    home = json.loads((_web_data() / "home" / f"{REFERENCE_GAME}.json").read_text("utf-8"))
    assert home["hitting"]["season"] == 2026 and home["hitting"]["pool_size"] == 361
    turang = next(h for h in home["teams"]["away"]["hitters"] if h["name"] == "Brice Turang")[
        "batting"
    ]
    assert turang["pa"] == 680
    assert turang["rates"] == {"avg": ".268", "obp": ".366", "slg": ".450", "ops": ".816"}
    assert turang["pct"] == {"avg": 78, "obp": 93, "slg": 77, "ops": 84}


@pytest.mark.slow
def test_official_lines_agree_with_statcast_for_reference_starters() -> None:
    """Audit against our own data: PA within 1 and AVG within .002 for all 18 starters."""
    path = project_root() / "data" / "processed" / "transitions_2026.parquet"
    if not path.exists():
        pytest.skip("processed Statcast data not available")
    events = pl.read_parquet(path).filter(pl.col("game_type") == "R")
    not_at_bat = [
        "walk",
        "intent_walk",
        "hit_by_pitch",
        "catcher_interf",
        "sac_fly",
        "sac_fly_double_play",
        "sac_bunt",
        "sac_bunt_double_play",
    ]
    hits = ["single", "double", "triple", "home_run"]
    home = json.loads((_web_data() / "home" / f"{REFERENCE_GAME}.json").read_text("utf-8"))
    for team in home["teams"].values():
        for h in team["hitters"]:
            ev = events.filter(pl.col("batter") == h["id"])["events"]
            pa = ev.len()
            ab = pa - int(ev.is_in(not_at_bat).sum())
            avg = int(ev.is_in(hits).sum()) / ab
            assert abs(pa - h["batting"]["pa"]) <= 1, h["name"]
            assert abs(avg - float(h["batting"]["rates"]["avg"])) <= 0.002, h["name"]
