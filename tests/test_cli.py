"""CLI entry points: path resolution, index building, reference-game protection, config."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from batting_order import cli
from batting_order.config import REFERENCE_GAME, project_root, tuned_hyper


def _make_project(tmp: Path) -> Path:
    (tmp / "pyproject.toml").write_text('[project]\nname = "batting-order"\n', encoding="utf-8")
    games = tmp / "web" / "public" / "data" / "games"
    games.mkdir(parents=True)
    for pk, date, ref in (
        (REFERENCE_GAME, "2026-10-28", True),
        (849805, "2026-10-23", False),
        (849802, "2026-10-24", False),
    ):
        game = {
            "game_pk": pk,
            "date": date,
            "game_type": "W",
            "series_description": "World Series",
            "series_game_number": 1,
            "away": "A",
            "home": "H",
            "away_abbr": "AAA",
            "home_abbr": "HHH",
            "away_runs": 1,
            "home_runs": 2,
        }
        if ref:
            game["reference"] = "true"
        (games / f"{pk}.json").write_text(json.dumps({"game": game}), encoding="utf-8")
    return tmp


def test_project_root_comes_from_env_not_package_location(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _make_project(tmp_path)
    monkeypatch.setenv("BATTING_ORDER_ROOT", str(root))
    assert project_root() == root.resolve()
    monkeypatch.setenv("BATTING_ORDER_ROOT", str(tmp_path / "nope"))
    with pytest.raises(FileNotFoundError):
        project_root()


def test_project_root_found_from_cwd(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    root = _make_project(tmp_path)
    monkeypatch.delenv("BATTING_ORDER_ROOT", raising=False)
    sub = root / "web" / "public"
    monkeypatch.chdir(sub)
    assert project_root() == root.resolve()


def test_index_lists_reference_first_then_newest(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    root = _make_project(tmp_path)
    monkeypatch.setenv("BATTING_ORDER_ROOT", str(root))
    cli.main(["index"])
    idx = json.loads((root / "web" / "public" / "data" / "index.json").read_text("utf-8"))
    assert [g["game_pk"] for g in idx["games"]] == [REFERENCE_GAME, 849802, 849805]
    assert idx["games"][0]["reference"] is True
    assert idx["reference_game"] == REFERENCE_GAME


def test_snapshot_refuses_to_overwrite_reference(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BATTING_ORDER_ROOT", str(_make_project(tmp_path)))
    with pytest.raises(SystemExit, match="refusing to overwrite"):
        cli.main(["snapshot", str(REFERENCE_GAME), "--season", "2026"])


def test_tuned_hyper_reads_e2_output(tmp_path: Path) -> None:
    root = _make_project(tmp_path)
    h, src = tuned_hyper(root)
    assert src.startswith("default")
    (root / "outputs").mkdir()
    (root / "outputs" / "e2_tuning.json").write_text(
        json.dumps(
            {"selected": {"batter_scale": 0.5, "pitcher_scale": 0.75, "half_life_days": 365.0}}
        )
    )
    h, src = tuned_hyper(root)
    assert (h.batter_scale, h.pitcher_scale, h.half_life_days) == (0.5, 0.75, 365.0)
    assert src == "outputs/e2_tuning.json"
