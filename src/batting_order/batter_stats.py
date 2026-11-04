"""Official season hitting lines and percentiles for the dashboard's Home page.

AVG, OBP, SLG and OPS come from the official MLB Stats API, as published, through the cached
client. MLB does not publish percentiles, so they are computed here against a pool of regular
hitters. Everything is cut off the day before the game: the Home page never uses later data.

The output (``web/public/data/home/{game_pk}.json``) also repeats the game-snapshot fields Home
needs, without the posterior draws, so the first page stays light. Snapshots themselves are read,
never written, so the published provenance of the model results is unaffected.
"""

from __future__ import annotations

import json
import math
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Protocol

from batting_order.data.statsapi import starting_position

MIN_PA = 200
"""A batter joins the percentile pool at this many plate appearances."""
MIN_POOL = 100
"""With a smaller pool (early season) the previous full regular season is used instead."""
RATES = ("avg", "obp", "slg", "ops")
SEASON_START = "03-01"
SOURCE = "MLB Stats API (statsapi.mlb.com), regular season, byDateRange"
HOME_SCHEMA_VERSION = 1


class HittingApi(Protocol):
    def get(
        self, path: str, params: dict[str, str] | None = None, refresh: bool = False
    ) -> dict[str, Any]: ...

    def boxscore(self, game_pk: int, refresh: bool = False) -> dict[str, Any]: ...


def hitting_params(season: int, end: date) -> dict[str, str]:
    """Query for all players' regular-season hitting from opening day through ``end``."""
    return {
        "stats": "byDateRange",
        "group": "hitting",
        "gameType": "R",
        "sportIds": "1",
        "playerPool": "ALL",
        "limit": "3000",
        "season": str(season),
        "startDate": f"{season}-{SEASON_START}",
        "endDate": end.isoformat(),
    }


def fetch_hitting(api: HittingApi, season: int, end: date) -> dict[int, dict[str, Any]]:
    """Official hitting line per player id. A player appearing twice keeps the larger row."""
    data = api.get("stats", hitting_params(season, end))
    stats = data.get("stats") or []
    rows: dict[int, dict[str, Any]] = {}
    for split in (stats[0].get("splits") or []) if stats else []:
        pid = int(split["player"]["id"])
        stat = split["stat"]
        pa = int(stat.get("plateAppearances") or 0)
        if pid not in rows or pa > int(rows[pid].get("plateAppearances") or 0):
            rows[pid] = stat
    return rows


def rate(value: object) -> float | None:
    """Numeric value of a published rate such as ``".268"``; ``None`` for ``".---"`` or missing."""
    try:
        v = float(str(value))
    except ValueError:
        return None
    return v if math.isfinite(v) else None


def percentile(pool_values: list[float], value: float) -> int:
    """Share of the pool strictly below ``value``, as a whole number clamped to 1-99."""
    if not pool_values:
        raise ValueError("empty percentile pool")
    share = sum(v < value for v in pool_values) / len(pool_values)
    return max(1, min(99, math.floor(100 * share + 0.5)))


def hitting_window(
    api: HittingApi, game_date: date
) -> tuple[dict[int, dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    """Rows, percentile pool and description of the window used for a game on ``game_date``."""
    season = game_date.year
    end = game_date - timedelta(days=1)
    rows = fetch_hitting(api, season, end)
    pool = _pool(rows)
    fallback = len(pool) < MIN_POOL
    if fallback:
        season -= 1
        end = date(season, 12, 31)
        rows = fetch_hitting(api, season, end)
        pool = _pool(rows)
        if len(pool) < MIN_POOL:
            raise ValueError(f"only {len(pool)} qualifying batters in {season}")
    if end >= game_date:
        raise ValueError(f"hitting window ends {end}, not before the game on {game_date}")
    meta = {
        "source": SOURCE,
        "season": season,
        "start": f"{season}-{SEASON_START}",
        "end": end.isoformat(),
        "previous_season": fallback,
        "min_pa": MIN_PA,
        "pool_size": len(pool),
    }
    return rows, pool, meta


def _pool(rows: dict[int, dict[str, Any]]) -> list[dict[str, Any]]:
    return [r for r in rows.values() if int(r.get("plateAppearances") or 0) >= MIN_PA]


def batting_line(
    player_id: int, rows: dict[int, dict[str, Any]], pool: list[dict[str, Any]]
) -> dict[str, Any]:
    """Published line and percentiles of one batter; rates without a value are ``None``."""
    row = rows.get(player_id)
    if row is None:
        return {
            "pa": 0,
            "small_sample": True,
            "rates": dict.fromkeys(RATES),
            "pct": dict.fromkeys(RATES),
        }
    pa = int(row.get("plateAppearances") or 0)
    rates: dict[str, str | None] = {}
    pct: dict[str, int | None] = {}
    for key in RATES:
        v = rate(row.get(key))
        rates[key] = None if v is None else str(row[key])
        if v is None:
            pct[key] = None
            continue
        values = [x for x in (rate(p.get(key)) for p in pool) if x is not None]
        pct[key] = percentile(values, v)
    return {"pa": pa, "small_sample": pa < MIN_PA, "rates": rates, "pct": pct}


def _starting_positions(box: dict[str, Any], side: str) -> dict[int, str]:
    """Position at first pitch per player. Published snapshots may hold the position at the end of
    the game, and they are not rewritten, so Home takes this from the box score."""
    players = box["teams"][side]["players"].values()
    return {int(p["person"]["id"]): starting_position(p) for p in players}


def _team(
    team: dict[str, Any],
    rows: dict[int, dict[str, Any]],
    pool: list[dict[str, Any]],
    positions: dict[int, str],
) -> dict[str, Any]:
    u = team["uncertainty"]
    opt = team["optimal"]
    return {
        "team": team["team"],
        "name": team["name"],
        "opponent_starter": {"name": team["opponent_starter"]["name"]},
        "hitters": [
            {
                "id": h["id"],
                "name": h["name"],
                "pos": positions.get(int(h["id"]), h["pos"]),
                "slot": h["slot"],
                "probs_starter": h["probs_starter"],
                "probs_bullpen": h["probs_bullpen"],
                "batting": batting_line(int(h["id"]), rows, pool),
            }
            for h in team["hitters"]
        ],
        "actual": {"er9": team["actual"]["er9"], "percentile": team["actual"]["percentile"]},
        "optimal": {
            "order": opt["order"],
            "er9": opt["er9"],
            "pa_by_slot": opt["pa_by_slot"],
            "run_distribution": opt["run_distribution"],
        },
        "worst": {"er9": team["worst"]["er9"]},
        "all_orders": {"count": team["all_orders"]["count"]},
        "uncertainty": {"p_opt_better": u["p_opt_better"], "diff_q05": u["diff_q05"]},
    }


def build_home(snapshot: dict[str, Any], api: HittingApi) -> dict[str, Any]:
    """Home-page data of one game, from its snapshot and the official hitting lines."""
    game = snapshot["game"]
    rows, pool, meta = hitting_window(api, date.fromisoformat(game["date"]))
    box = api.boxscore(int(game["game_pk"]))
    return {
        "schema_version": HOME_SCHEMA_VERSION,
        "game": {
            k: game.get(k)
            for k in (
                "game_pk",
                "date",
                "series_description",
                "series_game_number",
                "away",
                "home",
                "away_abbr",
                "home_abbr",
                "away_runs",
                "home_runs",
            )
        },
        "hitting": meta,
        "teams": {
            side: _team(snapshot["teams"][side], rows, pool, _starting_positions(box, side))
            for side in ("away", "home")
        },
    }


def write_home(web_data: Path, game_pk: int, api: HittingApi) -> Path:
    """Write ``home/{game_pk}.json`` from the game's snapshot."""
    snapshot = json.loads((web_data / "games" / f"{game_pk}.json").read_text(encoding="utf-8"))
    dest = web_data / "home" / f"{game_pk}.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(build_home(snapshot, api), separators=(",", ":"), ensure_ascii=False)
    dest.write_text(payload, encoding="utf-8")
    return dest
