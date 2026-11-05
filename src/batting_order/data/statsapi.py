"""Minimal client for the public MLB Stats API (statsapi.mlb.com).

Used for facts that Statcast does not carry: official starting lineups (from the
boxscore slot codes), probable/actual starting pitchers, venues and player names.
Responses are cached on disk (``data/raw/statsapi``) so that a snapshot can be
rebuilt offline and byte-identically.

Data © MLB Advanced Media, used for non-commercial research.
"""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests

log = logging.getLogger(__name__)
BASE = "https://statsapi.mlb.com/api/v1"
USER_AGENT = "batting-order-research/2.0 (non-commercial)"


class StatsApi:
    def __init__(self, cache_dir: Path, offline: bool = False) -> None:
        self.cache_dir = cache_dir
        self.offline = offline
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT

    def get(
        self, path: str, params: dict[str, str] | None = None, refresh: bool = False
    ) -> dict[str, Any]:
        key = path.strip("/").replace("/", "_")
        if params:
            key += "__" + "_".join(f"{k}-{v}" for k, v in sorted(params.items()))
        cache = self.cache_dir / f"{key.replace('|', '-').replace(',', '-')}.json"
        if cache.exists() and not refresh:
            data: dict[str, Any] = json.loads(cache.read_text(encoding="utf-8"))
            return data
        if self.offline:
            raise FileNotFoundError(f"offline and not cached: {path} {params}")
        for attempt in range(4):
            try:
                r = self.session.get(f"{BASE}/{path.lstrip('/')}", params=params, timeout=60)
                r.raise_for_status()
                break
            except requests.RequestException:
                if attempt == 3:
                    raise
                time.sleep(2**attempt)
        data = r.json()
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(data), encoding="utf-8")
        return data

    def schedule(
        self, season: int, game_types: str = "R,F,D,L,W", refresh: bool = False
    ) -> list[dict[str, Any]]:
        data = self.get(
            "schedule",
            {"sportId": "1", "season": str(season), "gameType": game_types, "hydrate": "venue"},
            refresh,
        )
        return [g for d in data.get("dates", []) for g in d["games"]]

    def boxscore(self, game_pk: int, refresh: bool = False) -> dict[str, Any]:
        return self.get(f"game/{game_pk}/boxscore", refresh=refresh)


@dataclass(frozen=True)
class Hitter:
    player_id: int
    name: str
    position: str
    slot: int  # 1..9


@dataclass(frozen=True)
class TeamLineup:
    team_id: int
    team_name: str
    abbreviation: str
    starters: list[Hitter]
    starting_pitcher_id: int
    starting_pitcher_name: str
    runs: int | None


def starting_position(player: dict[str, Any]) -> str:
    """Position at first pitch. ``position`` is where a player ended the game, which differs after
    a mid-game switch; ``allPositions`` lists them in the order played."""
    played = player.get("allPositions") or [player.get("position", {})]
    return str(played[0].get("abbreviation", ""))


def official_lineups(box: dict[str, Any]) -> dict[str, TeamLineup]:
    """Starting batting orders from a boxscore (slot codes ``100, 200, …, 900``).

    ``battingOrder`` in the boxscore reflects the end of the game; starters are the
    players whose own ``battingOrder`` code is an exact multiple of 100.
    """
    out: dict[str, TeamLineup] = {}
    for side in ("away", "home"):
        t = box["teams"][side]
        starters: list[Hitter] = []
        for p in t["players"].values():
            code = p.get("battingOrder")
            if code and int(code) % 100 == 0:
                starters.append(
                    Hitter(
                        player_id=int(p["person"]["id"]),
                        name=p["person"]["fullName"],
                        position=starting_position(p),
                        slot=int(code) // 100,
                    )
                )
        starters.sort(key=lambda h: h.slot)
        if [h.slot for h in starters] != list(range(1, 10)):
            raise ValueError(f"{side}: incomplete starting lineup {[h.slot for h in starters]}")
        sp_id = int(t["pitchers"][0])
        sp = t["players"][f"ID{sp_id}"]["person"]["fullName"]
        team = t["team"]
        out[side] = TeamLineup(
            team_id=int(team["id"]),
            team_name=team["name"],
            abbreviation=team.get("abbreviation", ""),
            starters=starters,
            starting_pitcher_id=sp_id,
            starting_pitcher_name=sp,
            runs=t.get("teamStats", {}).get("batting", {}).get("runs"),
        )
    return out
