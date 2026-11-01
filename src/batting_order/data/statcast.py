"""Bulk download of pitch-level Statcast data from Baseball Savant.

Raw files are written once and never modified (``data/raw/statcast/season=YYYY/``).
Each file covers a short date window so that every request stays well below the
Savant export cap (25,000 rows) and the download is resumable: an existing file is
never re-downloaded unless ``force=True``.

The data are © MLB Advanced Media and are used for non-commercial research only.
They are deliberately *not* versioned in Git (see ADR 0001); a checksum manifest is
written so that a reproduction can verify it obtained identical bytes.
"""

from __future__ import annotations

import hashlib
import io
import json
import logging
import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import polars as pl
import requests

log = logging.getLogger(__name__)

SAVANT_CSV_URL = "https://baseballsavant.mlb.com/statcast_search/csv"
SAVANT_ROW_CAP = 25_000
# Regular season (R), wild card (F), division series (D), LCS (L), World Series (W).
GAME_TYPES = ("R", "F", "D", "L", "W")
USER_AGENT = (
    "batting-order-research/2.0 (non-commercial; github.com/fernandogg2004/mlb-lineup-optimizer)"
)

# Columns are kept exactly as delivered (raw = native form). Types are forced to
# string on read and parsed downstream, so that a schema change on Savant's side
# cannot silently coerce values.


@dataclass(frozen=True)
class Window:
    start: date
    end: date

    @property
    def name(self) -> str:
        return f"{self.start.isoformat()}_{self.end.isoformat()}"


def season_windows(season: int, days: int = 2, today: date | None = None) -> Iterator[Window]:
    """Yield the fixed calendar grid of windows (Mar 1 – Nov 15) that have fully elapsed.

    The grid does not depend on ``today``: a window is yielded only once its last day is
    in the past, so a window file always covers exactly its nominal dates and repeated
    runs never create overlapping files.
    """
    today = today or date.today()
    start = date(season, 3, 1)
    season_end = date(season, 11, 15)
    while start <= season_end:
        end = min(start + timedelta(days=days - 1), season_end)
        if end >= today:
            return
        yield Window(start, end)
        start = end + timedelta(days=1)


def _query(window: Window, session: requests.Session, retries: int = 4) -> bytes:
    params = {
        "all": "true",
        "type": "details",
        "player_type": "batter",
        "hfGT": "|".join(GAME_TYPES) + "|",
        "game_date_gt": window.start.isoformat(),
        "game_date_lt": window.end.isoformat(),
    }
    delay = 5.0
    for attempt in range(1, retries + 1):
        try:
            r = session.get(SAVANT_CSV_URL, params=params, timeout=180)
            r.raise_for_status()
            return r.content
        except requests.RequestException as exc:  # network / 5xx
            if attempt == retries:
                raise
            log.warning("window %s attempt %d failed (%s); retrying", window.name, attempt, exc)
            time.sleep(delay)
            delay *= 2
    raise RuntimeError("unreachable")


def _parse(content: bytes) -> pl.DataFrame:
    text = content.decode("utf-8-sig")
    if not text.strip() or not text.lstrip().startswith('"'):
        return pl.DataFrame()
    return pl.read_csv(io.StringIO(text), infer_schema=False)  # all columns as Utf8


def download_window(
    window: Window, out_dir: Path, session: requests.Session, force: bool = False
) -> Path | None:
    """Download one window to ``out_dir/<start>_<end>.parquet``; split it if capped."""
    path = out_dir / f"{window.name}.parquet"
    if path.exists() and not force:
        return path
    df = _parse(_query(window, session))
    if df.height >= SAVANT_ROW_CAP - 1:
        if window.start == window.end:
            raise RuntimeError(f"single-day window {window.name} hit the Savant row cap")
        mid = window.start + (window.end - window.start) // 2
        log.info("window %s capped; splitting", window.name)
        download_window(Window(window.start, mid), out_dir, session, force)
        download_window(Window(mid + timedelta(days=1), window.end), out_dir, session, force)
        return None
    out_dir.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    df.write_parquet(tmp, compression="zstd")
    tmp.replace(path)  # atomic: a partially written file is never mistaken for a complete one
    log.info("window %s: %d rows", window.name, df.height)
    return path


def download_season(
    season: int,
    raw_root: Path,
    workers: int = 3,
    force: bool = False,
    today: date | None = None,
    force_recent_days: int = 0,
) -> list[Path]:
    """Download every elapsed window of ``season``; returns the list of window files.

    ``force_recent_days`` re-downloads windows ending within that many days of today
    (Statcast occasionally revises the most recent games).
    """
    today = today or date.today()
    out_dir = raw_root / f"season={season}"
    windows = list(season_windows(season, today=today))
    recent = today - timedelta(days=force_recent_days)
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {
            pool.submit(
                download_window,
                w,
                out_dir,
                session,
                force or (force_recent_days > 0 and w.end >= recent),
            ): w
            for w in windows
        }
        for fut in as_completed(futures):
            fut.result()  # surface errors
    paths = sorted(out_dir.glob("*.parquet"))
    write_manifest(out_dir)
    return paths


def write_manifest(season_dir: Path) -> Path:
    """Write ``MANIFEST.json`` with SHA-256 and row counts of every raw file."""
    entries = {}
    for p in sorted(season_dir.glob("*.parquet")):
        digest = hashlib.sha256(p.read_bytes()).hexdigest()
        rows = pl.scan_parquet(p).select(pl.len()).collect().item()
        entries[p.name] = {"sha256": digest, "rows": rows}
    manifest = season_dir / "MANIFEST.json"
    manifest.write_text(json.dumps(entries, indent=1, sort_keys=True))
    return manifest


def read_season(raw_root: Path, season: int) -> pl.DataFrame:
    """Concatenate all raw windows of a season (all columns as strings)."""
    files = sorted((raw_root / f"season={season}").glob("*.parquet"))
    if not files:
        raise FileNotFoundError(f"no raw Statcast files for {season} under {raw_root}")
    frames = [pl.read_parquet(f) for f in files]
    frames = [f for f in frames if f.height]
    df = pl.concat(frames, how="diagonal")
    # Safety net: a pitch is identified by (game, at-bat, pitch number).
    return df.unique(["game_pk", "at_bat_number", "pitch_number"], keep="last", maintain_order=True)
