# ADR 0002 — Static deployment with in-browser exact evaluation

- Status: accepted
- Date: 2026-11-01

## Context

The dashboard must offer interactive lineup evaluation and constrained optimization at zero
cost on Vercel Hobby. Vercel Hobby terms (docs last updated 2026-09-14/16) restrict use to
non-commercial personal projects (this project qualifies: no ads, payments or paid services),
include 100 GB/month of Fast Data Transfer and 1M edge requests, and pause rather than bill
when limits are exceeded. Serverless functions are available but limited (4 CPU-h/month).

## Decision

Ship a static Vite site. All fitting happens offline (`batting-order` CLI); each game snapshot
(~0.1–1 MB JSON) contains the kernel, the matchup probabilities and posterior draws. The browser
runs a TypeScript port of the exact evaluator: a lineup evaluates in about 1 ms, and an
exhaustive constrained search over 9! orders takes about 10 s in a Web Worker. No server
functions, database, API keys or paid services are used.

## Consequences

- Results in the browser are exact under the published model (same algorithm and tolerance as
  Python; parity tested to 1e-10), not approximations.
- New games require running the CLI (locally, in the manual GitHub Action, or via the optional
  Airflow DAG) and redeploying; Vercel does not ingest data.
- Measured costs: a snapshot of a game is fetched once per visit; with Hobby's 100 GB/month the
  site supports on the order of 10^5 visits per month before pausing.
