"""Assemble the evaluator input for one team in one game.

Regime 0 is the opposing starting pitcher, regime 1 the opposing bullpen. The
weight of regime 0 in inning ``k`` is the starter's (shrunk) historical share of
inning-``k`` plate appearances; pitching changes are modelled at inning boundaries.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from batting_order.engine.markov import Matchup
from batting_order.model.pa_model import Snapshot


@dataclass(frozen=True)
class GameContext:
    batters: list[int]  # roster in the ACTUAL batting order (slot 1..9)
    opp_starter: int
    opp_starter_throws: str  # "L" / "R"
    opp_team: str  # Statcast abbreviation of the fielding team


def build_matchup(snap: Snapshot, ctx: GameContext) -> Matchup:
    if len(ctx.batters) != 9 or len(set(ctx.batters)) != 9:
        raise ValueError("a lineup needs nine distinct batters")
    x_sp = np.stack(
        [snap.vs_pitcher(b, ctx.opp_starter, ctx.opp_starter_throws) for b in ctx.batters]
    )
    x_bp = np.stack([snap.vs_bullpen(b, ctx.opp_team) for b in ctx.batters])
    w_sp = np.clip(snap.starter_weights(ctx.opp_starter), 0.0, 1.0)
    w = np.column_stack([w_sp, 1.0 - w_sp])
    return Matchup(np.stack([x_sp, x_bp]), w)
