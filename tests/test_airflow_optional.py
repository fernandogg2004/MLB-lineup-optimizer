"""Airflow stays optional, isolated and disabled by default."""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
DAG = ROOT / "orchestration" / "airflow" / "dags" / "batting_order_update.py"


def test_core_package_never_imports_airflow() -> None:
    for py in (ROOT / "src" / "batting_order").rglob("*.py"):
        tree = ast.parse(py.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            names = []
            if isinstance(node, ast.Import):
                names = [a.name for a in node.names]
            elif isinstance(node, ast.ImportFrom) and node.module:
                names = [node.module]
            assert not any(n.split(".")[0] == "airflow" for n in names), py


def test_dag_is_paused_unscheduled_and_wraps_the_cli() -> None:
    src = DAG.read_text(encoding="utf-8")
    ast.parse(src)
    assert "is_paused_upon_creation=True" in src
    assert 'os.environ.get("BATTING_ORDER_SCHEDULE") or None' in src
    assert "catchup=False" in src
    assert "batting-order update" in src
    for forbidden in ("git push", "vercel", "git commit"):
        assert forbidden not in src


def test_compose_does_not_autostart_or_expose() -> None:
    compose = (ROOT / "orchestration" / "airflow" / "docker-compose.yml").read_text()
    assert "restart:" not in compose
    assert '"127.0.0.1:8080:8080"' in compose
    assert 'DAGS_ARE_PAUSED_AT_CREATION: "true"' in compose


def test_dag_imports_when_airflow_is_installed(monkeypatch: pytest.MonkeyPatch) -> None:
    pytest.importorskip("airflow")
    pytest.importorskip("airflow.providers.docker")
    monkeypatch.setenv("HOST_PROJECT_DIR", str(ROOT))
    import importlib.util

    spec = importlib.util.spec_from_file_location("dag", DAG)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert mod.dag.schedule_interval is None
