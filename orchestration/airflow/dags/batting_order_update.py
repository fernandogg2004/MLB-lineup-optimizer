"""Optional Airflow DAG: refresh data and dashboard snapshots (DISABLED by default).

It runs exactly one idempotent command, ``batting-order update``, inside the
``batting-order-pipeline`` image (DockerOperator), so Airflow never imports the
project and the project never imports Airflow.

Safety defaults:
* ``schedule`` is ``None`` unless ``BATTING_ORDER_SCHEDULE`` is set (e.g. ``0 11 * * *``);
* ``is_paused_upon_creation=True`` -- the DAG must be un-paused by hand;
* ``catchup=False`` and ``max_active_runs=1``.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta

from airflow import DAG
from airflow.providers.docker.operators.docker import DockerOperator
from docker.types import Mount

HOST_PROJECT_DIR = os.environ["HOST_PROJECT_DIR"]
IMAGE = os.environ.get("PIPELINE_IMAGE", "batting-order-pipeline:latest")
SCHEDULE = os.environ.get("BATTING_ORDER_SCHEDULE") or None
EXTRA_ARGS = os.environ.get("BATTING_ORDER_UPDATE_ARGS", "")

with DAG(
    dag_id="batting_order_update",
    description="Ingest the current season, rebuild tables, snapshot newly completed games",
    schedule=SCHEDULE,
    start_date=datetime(2026, 1, 1),
    catchup=False,
    max_active_runs=1,
    is_paused_upon_creation=True,
    default_args={"owner": "batting-order", "retries": 1, "retry_delay": timedelta(minutes=20)},
    tags=["batting-order", "optional"],
) as dag:
    DockerOperator(
        task_id="update",
        image=IMAGE,
        command=f"batting-order update {EXTRA_ARGS}".strip(),
        mounts=[Mount(source=HOST_PROJECT_DIR, target="/app", type="bind")],
        working_dir="/app",
        auto_remove="force",
        mount_tmp_dir=False,
        docker_url="unix://var/run/docker.sock",
    )
