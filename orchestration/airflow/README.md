# Optional Airflow orchestration (disabled by default)

Nothing in this repository needs Airflow. Tests, experiments, the paper, the dashboard
build and the Vercel deployment all run without it. This folder exists so that an
authorized operator can automate the season update on their own machine.

## What it runs

A single DAG, `batting_order_update`, with a single task:

```
batting-order update [BATTING_ORDER_UPDATE_ARGS]
```

That command downloads the current season from Baseball Savant (resumable), rebuilds the
processed tables, writes dashboard snapshots for newly completed postseason games (or the
last *N* games with `--last N`) and refreshes `web/public/data/index.json`. It is
idempotent: re-running it does no extra work. It runs inside the
`batting-order-pipeline` image via `DockerOperator`; the repository is bind-mounted, so
data are written to the host.

The DAG does **not** commit, push or deploy. Publishing remains a deliberate step
(see `docs/operations.md`).

## Safety defaults

| Setting | Default | Effect |
|---|---|---|
| `BATTING_ORDER_SCHEDULE` | empty | `schedule=None`: manual runs only |
| `is_paused_upon_creation` | `True` | the DAG appears paused |
| `AIRFLOW__CORE__DAGS_ARE_PAUSED_AT_CREATION` | `true` | same, globally |
| services `restart` | not set | nothing restarts on reboot |
| webserver port | `127.0.0.1:8080` | not exposed to the network |

## Activation (operator steps)

Requirements: Docker Engine / Docker Desktop with Compose.

```bash
cp orchestration/airflow/.env.example orchestration/airflow/.env
# edit HOST_PROJECT_DIR (absolute path) and the admin user/password

docker build -f orchestration/airflow/Dockerfile.pipeline -t batting-order-pipeline:latest .
docker compose -f orchestration/airflow/docker-compose.yml up -d

# open http://localhost:8080, log in, un-pause `batting_order_update`, trigger it.
# To schedule it, set BATTING_ORDER_SCHEDULE (cron) in .env and restart the stack.

docker compose -f orchestration/airflow/docker-compose.yml down        # stop
docker compose -f orchestration/airflow/docker-compose.yml down -v     # stop and delete its DB
```

## Verification status

`tests/test_airflow_optional.py` checks that the DAG file parses, keeps its safety defaults
and that the core package never imports Airflow. The stack itself was **not started** while
this version was prepared (Docker was not installed on the development machine).
