"""Raw Statcast pitches -> plate-appearance transitions and starting lineups.

Definitions (paper, Section 2.3):

* The *decisive row* of a plate appearance (PA) is the pitch carrying a non-empty
  ``events`` value. Its ``outs_when_up``/``on_1b``/``on_2b``/``on_3b``/``bat_score``
  describe the base-out state and score immediately before the decisive pitch.
* The transition of PA ``k`` goes from its own decisive state to the decisive state
  of PA ``k+1`` of the same half-inning (or to the absorbing three-out state), and
  its runs are the change in the batting team's score. Base-running events between
  the two decisive pitches (steals, pick-offs, wild pitches) are therefore part of
  the transition of PA ``k``.
* ``truncated_pa`` rows (the inning or game ended while a batter was at the plate)
  are not PAs; that batter leads off the next inning, exactly as in the model.
* The last transition of a walk-off half-inning is *censored* (the game ended before
  three outs) and is excluded from kernel estimation.

Only information available at the decisive pitch is used. Columns describing the
future (``*_days_until_next_game``, ``post_*`` except for run accounting) are never
exposed as features.
"""

from __future__ import annotations

import polars as pl

from batting_order.engine.states import ABSORB

OUTCOME_OF_EVENT: dict[str, str] = {
    "strikeout": "K",
    "strikeout_double_play": "K",
    "walk": "BB",
    "intent_walk": "BB",
    "hit_by_pitch": "BB",
    "catcher_interf": "BB",
    "single": "1B",
    "double": "2B",
    "triple": "3B",
    "home_run": "HR",
}
# Balls in play not recorded as hits: split by batted-ball type.
BIP_NO_HIT = {
    "field_out",
    "force_out",
    "grounded_into_double_play",
    "double_play",
    "triple_play",
    "field_error",
    "fielders_choice",
    "fielders_choice_out",
    "sac_fly",
    "sac_fly_double_play",
    "sac_bunt",
    "sac_bunt_double_play",
    "other_out",
}
NON_PA_EVENTS = {"truncated_pa"}
CLASS_INDEX = {"K": 0, "BB": 1, "1B": 2, "2B": 3, "3B": 4, "HR": 5, "GB": 6, "AIR": 7}
GAME_TYPES = ("R", "F", "D", "L", "W")


def _bip_class() -> pl.Expr:
    bb = pl.col("bb_type")
    ev = pl.col("events")
    return (
        pl.when(bb == "ground_ball")
        .then(pl.lit("GB"))
        .when(bb.is_in(["fly_ball", "line_drive", "popup"]))
        .then(pl.lit("AIR"))
        .when(ev.is_in(["sac_fly", "sac_fly_double_play"]))
        .then(pl.lit("AIR"))
        .otherwise(pl.lit("GB"))  # bunts / GIDP / missing bb_type
    )


def decisive_rows(raw: pl.DataFrame) -> pl.DataFrame:
    """Typed decisive pitches (one per PA or truncated PA), sorted within games."""
    ev = pl.col("events")
    df = raw.filter(ev.is_not_null() & (ev != "") & pl.col("game_type").is_in(GAME_TYPES))
    occupied = [
        (pl.col(c).is_not_null() & (pl.col(c) != "")).cast(pl.Int64)
        for c in ("on_1b", "on_2b", "on_3b")
    ]
    df = df.select(
        pl.col("game_pk").cast(pl.Int64),
        pl.col("game_date").str.slice(0, 10).str.to_date(),
        pl.col("game_type"),
        pl.col("game_year").cast(pl.Int64).alias("season"),
        pl.col("home_team"),
        pl.col("away_team"),
        pl.col("inning").cast(pl.Int64),
        pl.col("inning_topbot"),
        pl.col("at_bat_number").cast(pl.Int64),
        pl.col("pitch_number").cast(pl.Int64),
        pl.col("batter").cast(pl.Int64),
        pl.col("pitcher").cast(pl.Int64),
        pl.col("stand"),
        pl.col("p_throws"),
        ev,
        pl.col("bb_type"),
        pl.col("outs_when_up").cast(pl.Int64).alias("outs"),
        (occupied[0] + 2 * occupied[1] + 4 * occupied[2]).alias("bases"),
        pl.col("bat_score").cast(pl.Int64),
        pl.col("post_bat_score").cast(pl.Int64),
        pl.col("post_home_score").cast(pl.Int64),
        pl.col("post_away_score").cast(pl.Int64),
    )
    df = df.with_columns(
        pl.when(pl.col("inning_topbot") == "Top")
        .then(pl.col("away_team"))
        .otherwise(pl.col("home_team"))
        .alias("bat_team"),
        pl.when(pl.col("inning_topbot") == "Top")
        .then(pl.col("home_team"))
        .otherwise(pl.col("away_team"))
        .alias("fld_team"),
        pl.when(ev.is_in(list(NON_PA_EVENTS)))
        .then(pl.lit(None, dtype=pl.Utf8))
        .when(ev.is_in(list(OUTCOME_OF_EVENT)))
        .then(ev.replace_strict(OUTCOME_OF_EVENT, default=None))
        .when(ev.is_in(list(BIP_NO_HIT)))
        .then(_bip_class())
        .otherwise(pl.lit(None, dtype=pl.Utf8))
        .alias("outcome"),
    )
    return df.sort(["game_pk", "at_bat_number", "pitch_number"])


def transitions(dec: pl.DataFrame) -> pl.DataFrame:
    """One row per PA with its outcome class and observed base-out transition.

    Adds ``s`` (state), ``s_next`` (next state, 24 = three outs), ``runs``,
    ``censored`` (walk-off: excluded from kernel estimation) and ``conserved``
    (bookkeeping identity holds; rows failing it indicate data errors).
    """
    half = ["game_pk", "inning", "inning_topbot"]
    # Final score of each half-inning, including any truncated PA at its end.
    ends = dec.group_by(half).agg(
        pl.col("post_bat_score").last().alias("half_final_score"),
        pl.col("post_home_score").last().alias("end_home"),
        pl.col("post_away_score").last().alias("end_away"),
        pl.col("events").last().alias("last_event"),
    )
    pa = dec.filter(pl.col("outcome").is_not_null()).join(ends, on=half, how="left")
    pa = pa.sort(["game_pk", "at_bat_number"]).with_columns(
        pl.col("outs").shift(-1).over(half).alias("outs_next"),
        pl.col("bases").shift(-1).over(half).alias("bases_next"),
        pl.col("bat_score").shift(-1).over(half).alias("score_next"),
    )
    is_last = pl.col("outs_next").is_null()
    walkoff = (
        (pl.col("inning_topbot") == "Bot")
        & (pl.col("inning") >= 9)
        & (pl.col("end_home") > pl.col("end_away"))
    )
    pa = pa.with_columns(
        (8 * pl.col("outs") + pl.col("bases")).alias("s"),
        pl.when(is_last)
        .then(pl.lit(ABSORB, dtype=pl.Int64))
        .otherwise(8 * pl.col("outs_next") + pl.col("bases_next"))
        .alias("s_next"),
        pl.when(is_last)
        .then(pl.col("half_final_score") - pl.col("bat_score"))
        .otherwise(pl.col("score_next") - pl.col("bat_score"))
        .alias("runs"),
        (is_last & walkoff).alias("censored"),
        pl.col("outcome").replace_strict(CLASS_INDEX, return_dtype=pl.Int64).alias("c"),
    )

    def _count(col: str) -> pl.Expr:
        b = pl.col(col)
        return (b % 2) + ((b // 2) % 2) + ((b // 4) % 2)

    n_run = _count("bases")
    n_run_next = _count("bases_next")
    conserved = (
        pl.when(pl.col("s_next") == ABSORB)
        .then(pl.col("runs") + (3 - pl.col("outs")) <= n_run + 1)
        .otherwise(
            n_run + 1 == n_run_next + pl.col("runs") + (pl.col("outs_next") - pl.col("outs"))
        )
    )
    pa = pa.with_columns(
        conserved.fill_null(False).alias("conserved"),
        (pl.col("runs") >= 0).alias("runs_nonneg"),
    )
    return pa.drop(
        [
            "outs_next",
            "bases_next",
            "score_next",
            "end_home",
            "end_away",
            "half_final_score",
            "last_event",
            "post_bat_score",
            "post_home_score",
            "post_away_score",
        ]
    )


def starting_lineups(pa: pl.DataFrame) -> pl.DataFrame:
    """Infer each team's starting batting order from its first plate appearances.

    The starting order is the first nine distinct batters in PA order. It is marked
    ``reliable`` only when the first nine PAs are by nine distinct batters and the
    tenth PA (if any) is by the leadoff hitter, i.e. no substitution happened during
    the first time through the order. Unreliable games are excluded from backtests.
    """
    seq = (
        pa.sort(["game_pk", "at_bat_number"])
        .group_by(["game_pk", "bat_team"], maintain_order=True)
        .agg(
            pl.col("batter").alias("batters"),
            pl.col("game_date").first(),
            pl.col("season").first(),
            pl.col("game_type").first(),
            pl.col("home_team").first(),
            pl.col("away_team").first(),
            pl.col("fld_team").first(),
            pl.col("pitcher").first().alias("opp_starter"),
            pl.col("p_throws").first().alias("opp_starter_throws"),
        )
    )
    rows = []
    for r in seq.iter_rows(named=True):
        b = r.pop("batters")
        first9 = b[:9]
        reliable = len(first9) == 9 and len(set(first9)) == 9 and (len(b) < 10 or b[9] == b[0])
        rows.append({**r, "lineup": first9, "reliable": reliable})
    return pl.DataFrame(rows)


def data_quality(pa: pl.DataFrame) -> dict[str, float]:
    """Summary counts used in the data-quality report and tests."""
    n = pa.height
    return {
        "pa": n,
        "censored": int(pa["censored"].sum()),
        "non_conserved": int((~pa["conserved"]).sum()),
        "negative_runs": int((~pa["runs_nonneg"]).sum()),
        "non_conserved_rate": float((~pa["conserved"]).sum() / max(n, 1)),
    }
