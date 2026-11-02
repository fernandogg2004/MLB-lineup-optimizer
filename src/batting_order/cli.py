"""Command-line interface: ``batting-order <command>``.

Every command is idempotent and safe to re-run; it is the single entry point used
locally, by the manual GitHub Action and by the optional Airflow DAG.

    ingest     download raw Statcast for seasons (resumable; skips existing windows)
    verify     compare downloaded raw files with the published checksums (data_manifest/)
    manifest   publish checksums of local raw files to data_manifest/
    build      raw -> processed transitions/lineups for seasons
    snapshot   write dashboard snapshots for given games (+ refresh the index)
    update     ingest + build the current season, snapshot newly completed postseason
               games (or the last N completed games) and refresh the index
    experiments  run the paper experiments (E1-E5); see ``batting_order.evaluate.run``
"""

from __future__ import annotations

import argparse
import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

import polars as pl

from batting_order.config import REFERENCE_GAME, project_root
from batting_order.data.build import build_season, load_transitions
from batting_order.data.statcast import download_season, verify_season, write_manifest
from batting_order.data.statsapi import StatsApi
from batting_order.snapshot import build_game_snapshot, write_snapshot

HISTORY_SEASONS = 3


def _data() -> Path:
    return project_root() / "data"


def _web_data() -> Path:
    return project_root() / "web" / "public" / "data"


def _api(offline: bool = False) -> StatsApi:
    return StatsApi(_data() / "raw" / "statsapi", offline=offline)


def _seasons_for(season: int) -> list[int]:
    have = sorted(
        int(p.stem.split("_")[1]) for p in (_data() / "processed").glob("transitions_*.parquet")
    )
    return [s for s in have if season - HISTORY_SEASONS <= s <= season]


def cmd_ingest(a: argparse.Namespace) -> None:
    for s in a.seasons:
        download_season(s, _data() / "raw" / "statcast", workers=a.workers)


def cmd_build(a: argparse.Namespace) -> None:
    api = _api()
    for s in a.seasons:
        build_season(s, _data(), api)


def _manifest_dir() -> Path:
    return project_root() / "data_manifest"


def cmd_manifest(a: argparse.Namespace) -> None:
    """Publish the SHA-256 manifest of local raw files to the versioned data_manifest/ folder."""
    out = _manifest_dir()
    out.mkdir(exist_ok=True)
    for s in a.seasons:
        season_dir = _data() / "raw" / "statcast" / f"season={s}"
        src = write_manifest(season_dir)
        (out / f"statcast_{s}.json").write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        logging.info("published manifest for %d", s)


def cmd_verify(a: argparse.Namespace) -> None:
    """Exit non-zero if local raw files differ from the published manifests."""
    bad = False
    for s in a.seasons:
        res = verify_season(
            _data() / "raw" / "statcast" / f"season={s}", _manifest_dir() / f"statcast_{s}.json"
        )
        n = sum(len(v) for v in res.values())
        logging.info("season %d: %s", s, "OK" if n == 0 else res)
        bad |= n > 0
    if bad:
        raise SystemExit("raw data differ from data_manifest/ (see log)")


def snapshot_games(game_pks: list[int], season: int, draws: int, force: bool = False) -> list[Path]:
    """Write snapshots for ``game_pks``. The reference game is only rewritten with ``force``
    (its published snapshot is produced by experiment E5 with 400 draws and seed 2026)."""
    if REFERENCE_GAME in game_pks and not force:
        raise SystemExit(
            f"refusing to overwrite the reference game {REFERENCE_GAME}; it is produced by "
            "`batting-order experiments --only e5` (use --force to override)"
        )
    pa = load_transitions(_data(), _seasons_for(season))
    api = _api()
    out = []
    for pk in game_pks:
        snap = build_game_snapshot(pk, pa, api, project_root(), n_draws=draws)
        dest = _web_data() / "games" / f"{pk}.json"
        write_snapshot(snap, dest)
        out.append(dest)
        logging.info("snapshot %d -> %s", pk, dest)
    write_index()
    return out


def write_index() -> Path:
    """Rebuild ``index.json`` from the snapshot files present (reference game first)."""
    entries = []
    web_data = _web_data()
    for p in sorted((web_data / "games").glob("*.json")):
        s = json.loads(p.read_text(encoding="utf-8"))
        g = s["game"]
        entries.append(
            {
                "game_pk": g["game_pk"],
                "date": g["date"],
                "game_type": g["game_type"],
                "series_description": g["series_description"],
                "series_game_number": g["series_game_number"],
                "away": g["away"],
                "home": g["home"],
                "away_abbr": g["away_abbr"],
                "home_abbr": g["home_abbr"],
                "away_runs": g["away_runs"],
                "home_runs": g["home_runs"],
                "reference": g.get("reference") == "true",
                "path": f"games/{p.name}",
            }
        )
    ref = [e for e in entries if e["reference"]]
    rest = sorted((e for e in entries if not e["reference"]), key=lambda e: e["date"], reverse=True)
    dest = web_data / "index.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(
        json.dumps({"reference_game": REFERENCE_GAME, "games": ref + rest}, indent=1),
        encoding="utf-8",
    )
    return dest


def cmd_snapshot(a: argparse.Namespace) -> None:
    snapshot_games(a.games, a.season, a.draws, a.force)


def completed_games(api: StatsApi, season: int, game_types: str) -> list[dict[str, Any]]:
    games = api.schedule(season, game_types, refresh=True)
    return [
        g
        for g in games
        if g["status"]["abstractGameState"] == "Final"
        and g["status"]["detailedState"] in ("Final", "Game Over", "Completed Early")
    ]


def cmd_update(a: argparse.Namespace) -> None:
    """Refresh the current season and snapshot newly completed games.

    By default only postseason games are snapshotted (keeps the deployed bundle
    small); ``--last N`` instead snapshots the N most recent completed games.
    """
    season = a.season or date.today().year
    data = _data()
    download_season(season, data / "raw" / "statcast", workers=a.workers, force_recent_days=3)
    api = _api()
    build_season(season, data, api)
    have = {int(p.stem) for p in (_web_data() / "games").glob("*.json")}
    if a.last:
        games = completed_games(api, season, "R,F,D,L,W")[-a.last :]
    else:
        games = completed_games(api, season, "F,D,L,W")
    processed = set(
        pl.read_parquet(data / "processed" / f"transitions_{season}.parquet")["game_pk"]
        .unique()
        .to_list()
    )
    todo = [
        int(g["gamePk"])
        for g in games
        if int(g["gamePk"]) not in have and int(g["gamePk"]) in processed
    ]
    logging.info("%d new completed games to snapshot", len(todo))
    if todo:
        snapshot_games(todo, season, a.draws)
    else:
        write_index()


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(
        prog="batting-order",
        epilog="Paths are resolved from $BATTING_ORDER_ROOT or the current directory.",
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = p.add_subparsers(dest="cmd", required=True)
    i = sub.add_parser("ingest", help="download raw Statcast seasons")
    i.add_argument("seasons", type=int, nargs="+")
    i.add_argument("--workers", type=int, default=3)
    i.set_defaults(fn=cmd_ingest)
    b = sub.add_parser("build", help="raw -> processed tables")
    b.add_argument("seasons", type=int, nargs="+")
    b.set_defaults(fn=cmd_build)
    mf = sub.add_parser("manifest", help="publish checksums of local raw data to data_manifest/")
    mf.add_argument("seasons", type=int, nargs="+")
    mf.set_defaults(fn=cmd_manifest)
    vf = sub.add_parser("verify", help="compare local raw data with data_manifest/")
    vf.add_argument("seasons", type=int, nargs="+")
    vf.set_defaults(fn=cmd_verify)
    s = sub.add_parser("snapshot", help="dashboard snapshots for games")
    s.add_argument("games", type=int, nargs="+")
    s.add_argument("--season", type=int, required=True)
    s.add_argument("--draws", type=int, default=200)
    s.add_argument("--force", action="store_true", help="allow rewriting the reference game")
    s.set_defaults(fn=cmd_snapshot)
    u = sub.add_parser("update", help="refresh current season and snapshot new games")
    u.add_argument("--season", type=int)
    u.add_argument("--last", type=int, default=0, help="snapshot the last N completed games")
    u.add_argument("--draws", type=int, default=200)
    u.add_argument("--workers", type=int, default=3)
    u.set_defaults(fn=cmd_update)
    ix = sub.add_parser("index", help="rebuild web/public/data/index.json")
    ix.set_defaults(fn=lambda a: write_index())
    e = sub.add_parser("experiments", help="run paper experiments")
    e.add_argument("--only", nargs="*", default=None)
    e.add_argument("--quick", action="store_true", help="small samples for smoke testing")
    e.set_defaults(
        fn=lambda a: __import__("batting_order.evaluate.run", fromlist=["main"]).main(
            a.only, a.quick
        )
    )
    args = p.parse_args(argv)
    args.fn(args)


if __name__ == "__main__":
    main()
