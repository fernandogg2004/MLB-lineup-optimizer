"""Parsing, transition construction, lineup inference and leakage guarantees."""

from __future__ import annotations

import itertools
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import polars as pl
import pytest

from batting_order.data.plate_appearances import (
    CLASS_INDEX,
    decisive_rows,
    starting_lineups,
    transitions,
)
from batting_order.data.statcast import Window, season_windows
from batting_order.engine.states import ABSORB
from batting_order.model.kernel import count_transitions, fit_kernel
from batting_order.model.pa_model import Hyper, build_snapshot


def _pitch(
    game: int,
    ab: int,
    inning: int,
    half: str,
    batter: int,
    event: str | None,
    outs: int,
    b1: bool = False,
    b2: bool = False,
    b3: bool = False,
    score: int = 0,
    post: int | None = None,
    bb_type: str | None = None,
    d: str = "2026-05-01",
    home: int = 0,
    away: int = 0,
    pitcher: int = 900,
) -> dict[str, str | None]:
    post = score if post is None else post
    return {
        "game_pk": str(game),
        "game_date": d,
        "game_type": "R",
        "game_year": d[:4],
        "home_team": "HOM",
        "away_team": "AWY",
        "inning": str(inning),
        "inning_topbot": half,
        "at_bat_number": str(ab),
        "pitch_number": "1",
        "batter": str(batter),
        "pitcher": str(pitcher),
        "stand": "R",
        "p_throws": "R",
        "events": event,
        "bb_type": bb_type,
        "outs_when_up": str(outs),
        "on_1b": "1" if b1 else None,
        "on_2b": "2" if b2 else None,
        "on_3b": "3" if b3 else None,
        "bat_score": str(score),
        "post_bat_score": str(post),
        "post_home_score": str(home),
        "post_away_score": str(away),
        "description": "x",
        "des": "x",
    }


def _half_inning() -> pl.DataFrame:
    """Top 1st: single, HR (2 runs), K, groundout DP? no: GB out, fly out."""
    rows = [
        _pitch(1, 1, 1, "Top", 101, "single", 0, score=0),
        _pitch(1, 2, 1, "Top", 102, "home_run", 0, b1=True, score=0, post=2),
        _pitch(1, 3, 1, "Top", 103, "strikeout", 0, score=2),
        _pitch(1, 4, 1, "Top", 104, "field_out", 1, score=2, bb_type="ground_ball"),
        _pitch(1, 5, 1, "Top", 105, "field_out", 2, score=2, bb_type="fly_ball"),
        # The game then ends normally: bottom of the 9th, visitors ahead, third out.
        _pitch(1, 60, 9, "Bot", 201, "strikeout", 2, home=0, away=2),
    ]
    return pl.DataFrame(rows)


def test_transitions_chain_states_and_runs() -> None:
    pa = transitions(decisive_rows(_half_inning())).filter(pl.col("inning") == 1)
    assert pa["outcome"].to_list() == ["1B", "HR", "K", "GB", "AIR"]
    assert pa["s"].to_list() == [0, 1, 0, 8, 16]
    assert pa["s_next"].to_list() == [1, 0, 8, 16, ABSORB]
    assert pa["runs"].to_list() == [0, 2, 0, 0, 0]
    assert pa["conserved"].all()
    assert not pa["censored"].any()


def test_truncated_pa_is_not_a_plate_appearance() -> None:
    df = _half_inning().head(4)  # single, HR, K, then...
    extra = pl.DataFrame([_pitch(1, 5, 1, "Top", 105, "truncated_pa", 2, b1=True, score=2)])
    pa = transitions(decisive_rows(pl.concat([df, extra])))
    assert pa.height == 4
    assert pa["s_next"].to_list()[-1] == ABSORB  # GB out was the last PA of the half


def test_walkoff_is_censored() -> None:
    rows = [
        _pitch(2, 70, 9, "Bot", 201, "single", 1, score=3, home=3, away=3),
        _pitch(2, 71, 9, "Bot", 202, "double", 1, b1=True, score=3, post=4, home=4, away=3),
    ]
    pa = transitions(decisive_rows(pl.DataFrame(rows)))
    assert pa["censored"].to_list() == [False, True]
    N = count_transitions(pa)
    assert N.sum() == 1  # censored transition excluded from the kernel counts


def test_bip_classes_and_errors() -> None:
    rows = [
        _pitch(3, 1, 1, "Top", 1, "field_error", 0, bb_type="ground_ball"),
        _pitch(3, 2, 1, "Top", 2, "sac_fly", 0, b1=True, b3=True, bb_type="fly_ball", post=1),
        _pitch(3, 3, 1, "Top", 3, "catcher_interf", 1, b1=True, score=1),
        _pitch(3, 4, 1, "Top", 4, "grounded_into_double_play", 1, b1=True, b2=True, score=1),
    ]
    pa = transitions(decisive_rows(pl.DataFrame(rows)))
    assert pa["outcome"].to_list() == ["GB", "AIR", "BB", "GB"]
    assert set(CLASS_INDEX) == {"K", "BB", "1B", "2B", "3B", "HR", "GB", "AIR"}


def test_lineup_inference_and_reliability() -> None:
    rows = [
        _pitch(4, i + 1, 1 + i // 3, "Top", 300 + (i % 9), "strikeout", i % 3) for i in range(10)
    ]
    lu = starting_lineups(transitions(decisive_rows(pl.DataFrame(rows))))
    assert lu["lineup"].to_list()[0] == [300 + i for i in range(9)]
    assert lu["reliable"].to_list() == [True]
    rows[9]["batter"] = "999"  # a pinch hitter appears before the order turns over
    lu2 = starting_lineups(transitions(decisive_rows(pl.DataFrame(rows))))
    assert lu2["reliable"].to_list() == [False]


def test_season_windows_are_a_fixed_non_overlapping_grid() -> None:
    a = list(season_windows(2026, today=date(2026, 6, 1)))
    b = list(season_windows(2026, today=date(2026, 9, 1)))
    assert [w.name for w in a] == [w.name for w in b[: len(a)]]
    for w1, w2 in itertools.pairwise(b):
        assert w2.start == w1.end + timedelta(days=1)
    assert all(w.end < date(2026, 6, 1) for w in a)
    assert Window(date(2026, 3, 1), date(2026, 3, 2)).name == "2026-03-01_2026-03-02"


def _synthetic_pa(n_days: int = 60) -> pl.DataFrame:
    rng = np.random.default_rng(0)
    rows = []
    start = date(2026, 4, 1)
    for d in range(n_days):
        for g in range(3):
            for k in range(30):
                rows.append(
                    {
                        "game_pk": d * 10 + g,
                        "game_date": start + timedelta(days=d),
                        "season": 2026,
                        "game_type": "R",
                        "inning": 1 + k // 4,
                        "inning_topbot": "Top",
                        "at_bat_number": k + 1,
                        "batter": int(rng.integers(1, 30)),
                        "pitcher": 500 + g,
                        "stand": "R" if k % 3 else "L",
                        "p_throws": "R",
                        "fld_team": f"T{g}",
                        "bat_team": "B",
                        "c": int(rng.integers(0, 8)),
                        "s": 0,
                        "s_next": 1,
                        "runs": 0,
                        "censored": False,
                        "conserved": True,
                    }
                )
    return pl.DataFrame(rows)


def test_snapshot_uses_only_data_before_cutoff() -> None:
    """Changing every PA on or after the cutoff must not change the snapshot."""
    pa = _synthetic_pa()
    cut = date(2026, 5, 1)
    s1 = build_snapshot(pa, cut, Hyper())
    tampered = pa.with_columns(
        pl.when(pl.col("game_date") >= cut)
        .then((pl.col("c") + 3) % 8)
        .otherwise(pl.col("c"))
        .alias("c")
    )
    s2 = build_snapshot(tampered, cut, Hyper())
    for b in s1.batter_mult:
        np.testing.assert_array_equal(s1.batter_mult[b], s2.batter_mult[b])
    for k in s1.league:
        np.testing.assert_array_equal(s1.league[k], s2.league[k])
    k1 = fit_kernel(pa, cut, date(2026, 4, 1))
    k2 = fit_kernel(
        tampered.with_columns(
            pl.when(pl.col("game_date") >= cut).then(5).otherwise(pl.col("s_next")).alias("s_next")
        ),
        cut,
        date(2026, 4, 1),
    )
    np.testing.assert_array_equal(k1.J, k2.J)


def test_multipliers_shrink_to_one_without_history() -> None:
    pa = _synthetic_pa(10)
    s = build_snapshot(pa, date(2026, 4, 11), Hyper())
    unseen = 123456
    p = s.vs_pitcher(unseen, 999999, "R")
    np.testing.assert_allclose(p, s.league[(s.side(unseen, "R"), "R")])
    assert p.sum() == pytest.approx(1.0)


def test_posterior_sampling_is_reproducible_and_valid() -> None:
    pa = _synthetic_pa(30)
    s = build_snapshot(pa, date(2026, 5, 1), Hyper())
    a = s.sample(np.random.default_rng(1), [1, 2], [500], ["T0"])
    b = s.sample(np.random.default_rng(1), [1, 2], [500], ["T0"])
    np.testing.assert_array_equal(a.batter_mult[1], b.batter_mult[1])
    p = a.vs_pitcher(1, 500, "R")
    assert np.all(p > 0) and p.sum() == pytest.approx(1.0)
    assert s.batter_mult is not a.batter_mult  # original snapshot untouched


def test_verify_detects_changed_missing_and_extra_files(tmp_path: Path) -> None:
    from batting_order.data.statcast import verify_season, write_manifest

    d = tmp_path / "season=2026"
    d.mkdir()
    for name in ("a.parquet", "b.parquet"):
        pl.DataFrame({"x": [1, 2]}).write_parquet(d / name)
    ref = tmp_path / "ref.json"
    ref.write_text(write_manifest(d).read_text())
    assert verify_season(d, ref) == {"missing": [], "changed": [], "extra": []}
    pl.DataFrame({"x": [3]}).write_parquet(d / "a.parquet")
    (d / "b.parquet").unlink()
    pl.DataFrame({"x": [4]}).write_parquet(d / "c.parquet")
    res = verify_season(d, ref)
    assert res == {"missing": ["b.parquet"], "changed": ["a.parquet"], "extra": ["c.parquet"]}


def test_out_decreasing_or_negative_run_transitions_are_not_conserved() -> None:
    rows = [
        _pitch(5, 1, 1, "Top", 1, "single", 1),
        _pitch(5, 2, 1, "Top", 2, "walk", 0, b1=True),  # outs went 1 -> 0: scorer error
        _pitch(5, 3, 1, "Top", 3, "strikeout", 0, b1=True, b2=True),
        _pitch(5, 4, 1, "Top", 4, "strikeout", 1, b1=True, b2=True),
        _pitch(5, 5, 1, "Top", 5, "strikeout", 2, b1=True, b2=True),
    ]
    pa = transitions(decisive_rows(pl.DataFrame(rows)))
    assert pa["conserved"].to_list()[0] is False
    assert pa["conserved"].to_list()[1:] == [True, True, True, True]


def test_called_games_and_short_walkoffs_are_censored() -> None:
    called = [  # game called in the top of the 5th
        _pitch(6, 1, 5, "Top", 1, "single", 0, home=1, away=0),
        _pitch(6, 2, 5, "Top", 2, "strikeout", 0, b1=True, home=1, away=0),
    ]
    seven = [  # seven-inning doubleheader game ending on a walk-off in the 7th
        _pitch(7, 50, 7, "Bot", 3, "walk", 1, home=2, away=2),
        _pitch(7, 51, 7, "Bot", 4, "single", 1, b1=True, b2=True, score=2, post=3, home=3, away=2),
    ]
    pa = transitions(decisive_rows(pl.DataFrame(called + seven)))
    by_game = {g: df["censored"].to_list() for (g,), df in pa.group_by(["game_pk"])}
    assert by_game[6] == [False, True]
    assert by_game[7] == [False, True]


def test_every_snapshot_field_ignores_data_on_or_after_cutoff() -> None:
    """Extends the leakage test to pitchers, bullpens, starter curves and batter sides."""
    pa = _synthetic_pa()
    cut = date(2026, 5, 1)
    later = pl.col("game_date") >= cut
    tampered = pa.with_columns(
        pl.when(later).then((pl.col("c") + 5) % 8).otherwise(pl.col("c")).alias("c"),
        pl.when(later).then(pl.lit("L")).otherwise(pl.col("stand")).alias("stand"),
        pl.when(later).then(pl.col("inning") + 1).otherwise(pl.col("inning")).alias("inning"),
    )
    a, b = build_snapshot(pa, cut, Hyper()), build_snapshot(tampered, cut, Hyper())
    for name in ("batter_mult", "pitcher_mult", "bullpen_mult", "starter_curve"):
        da, db = getattr(a, name), getattr(b, name)
        assert da.keys() == db.keys(), name
        for k in da:
            np.testing.assert_array_equal(da[k], db[k])
    assert a.batter_side == b.batter_side
    assert a.bullpen_hand_share == b.bullpen_hand_share
    np.testing.assert_array_equal(a.league_starter_curve, b.league_starter_curve)


def test_kernel_window_ends_on_first_day_of_month() -> None:
    from batting_order.model.kernel import kernel_for

    pa = _synthetic_pa(60)
    k = kernel_for(pa, date(2026, 5, 20), {})
    assert k.meta["cutoff"] == "2026-05-01"
    assert date.fromisoformat(str(k.meta["start"])) <= date(2026, 4, 1)
