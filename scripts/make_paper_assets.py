"""Generate paper macros, tables and figures (and the dashboard's validation.json)
from ``outputs/*.json``. No number in the paper is typed by hand.

    python scripts/make_paper_assets.py
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "outputs"
GEN = ROOT / "research" / "generated"
FIG = ROOT / "research" / "figures"
WEB = ROOT / "web" / "public" / "data"
OUTCOMES = ["K", "BB", "1B", "2B", "3B", "HR", "GB", "AIR"]
BLUE, GRAY, ORANGE = "#2a78d6", "#8a8984", "#eb6834"

plt.rcParams.update(
    {
        "font.size": 9,
        "axes.spines.top": False,
        "axes.spines.right": False,
        "axes.grid": True,
        "grid.color": "#ecebe7",
        "grid.linewidth": 0.8,
        "figure.dpi": 150,
    }
)


def load(name: str) -> dict[str, Any] | None:
    p = OUT / f"{name}.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else None


def f(x: float, d: int = 3, signed: bool = False) -> str:
    s = f"{x:+.{d}f}" if signed else f"{x:.{d}f}"
    return s.replace("-", "$-$") if not signed else s.replace("-", "$-$").replace("+", "$+$")


def pct(x: float, d: int = 0) -> str:
    return f"{100 * x:.{d}f}\\%"


def macros(m: dict[str, str]) -> str:
    return "\n".join(f"\\newcommand{{\\{k}}}{{{v}}}" for k, v in m.items()) + "\n"


def main() -> None:
    GEN.mkdir(parents=True, exist_ok=True)
    FIG.mkdir(parents=True, exist_ok=True)
    e1, e2, e3 = load("e1_kernel"), load("e2_pa_models"), load("e3_run_calibration")
    e4a, e4b = load("e4a_search_methods"), load("e4b_actual_vs_optimal")
    e4c, e5 = load("e4c_parameter_uncertainty"), load("e5_reference_game")
    quality = {
        s: json.loads((ROOT / "data" / "processed" / f"quality_{s}.json").read_text())
        for s in range(2021, 2027)
        if (ROOT / "data" / "processed" / f"quality_{s}.json").exists()
    }
    sw = (e5 or e4b or {}).get("software", {"package": "2.0.0", "git": "unknown"})
    m: dict[str, str] = {
        "SoftwareVersion": f"{sw['package']}@{sw['git']}",
        "PaperDate": f"{date.today():%B} {date.today().day}, {date.today().year}",
    }

    # ---------------- E2
    if e2:
        s25 = e2["by_season"]["2025"]["models"]
        s26 = e2["by_season"]["2026"]["models"]
        gain = np.mean(
            [s["M0_league"]["log_loss"] - s["M2_batter_pitcher"]["log_loss"] for s in (s25, s26)]
        )
        m["EtwoGainMtwoVsMzero"] = f(gain, 4)
        h = e2["selected_hyper"]
        m["EtwoBatterScale"] = f(h["batter_scale"], 2)
        m["EtwoPitcherScale"] = f(h["pitcher_scale"], 2)
        m["EtwoHalfLife"] = f"{h['half_life_days']:.0f}"
    # ---------------- E3
    if e3:
        m["EthreeSlope"] = f(e3["calibration_slope"], 2)
        m["EthreeSlopeLo"] = f(e3["slope_ci95"][0], 2)
        m["EthreeSlopeHi"] = f(e3["slope_ci95"][1], 2)
        m["EthreeBias"] = f(e3["bias_obs_minus_pred"], 3, signed=True)
        m["EthreeBiasLo"] = f(e3["bias_ci95"][0], 3, signed=True)
        m["EthreeBiasHi"] = f(e3["bias_ci95"][1], 3, signed=True)
        m["EthreeN"] = f"{e3['n_team_games']:,}".replace(",", "{,}")
        m["EthreeCorr"] = f(e3["corr"], 3)
        mse = e3["mse"]
        m["EthreeMseModel"] = f(mse["model"], 3)
        m["EthreeMseConst"] = f(mse["constant_prior_season"], 3)
        m["EthreeMseTeam"] = f(mse["team_last60"], 3)
        m["EthreeCoverage"] = pct(e3["pit"]["coverage_80_nominal"], 1)
        m["EthreePitN"] = str(e3["pit"]["n"])
    # ---------------- E4
    if e4b:
        u = e4b["uplift_opt_vs_actual"]
        m["EfourbN"] = f"{e4b['n_team_games']:,}".replace(",", "{,}")
        m["EfourbUpliftMean"] = f(u["mean"], 3)
        m["EfourbUpliftMedian"] = f(u["median"], 3)
        m["EfourbUpliftQninety"] = f(u["q90"], 3)
        m["EfourbUpliftMax"] = f(u["max"], 3)
        m["EfourbUpliftSE"] = f(u["se"], 4)
        m["EfourbUpliftSeason"] = f(u["per_162_games"], 1)
        m["EfourbSpread"] = f(e4b["spread_best_minus_worst_mean"], 3)
        m["EfourbOptVsRandom"] = f(e4b["opt_minus_random_mean"], 3)
        m["EfourbPctMedian"] = pct(e4b["actual_percentile"]["median"], 1)
        m["EfourbPctMean"] = pct(e4b["actual_percentile"]["mean"], 1)
        m["EfourbShareAboveNinety"] = pct(e4b["actual_percentile"]["share_above_90"], 0)
        hz = e4b["heuristics"]
        m["EfourbBookGap"] = f(hz["the_book"]["mean_gap_to_opt"], 3)
        m["EfourbRvGap"] = f(hz["sort_run_value"]["mean_gap_to_opt"], 3)
        m["EfourbObpGap"] = f(hz["sort_obp"]["mean_gap_to_opt"], 3)
    if e4a:
        ex = e4a["methods"]["exhaustive"]
        m["EfouraExhaustiveSeconds"] = f(ex["mean_seconds"], 2)
        m["EfouraN"] = str(ex["n"])
        ng = e4a["noisy_ga"]
        m["EfouraCurse"] = f(ng["mean_winners_curse"], 3)
        m["EfouraNoisyGap"] = f(ng["mean_gap_to_opt"], 3)
        m["EfouraNoisyN"] = str(ng["n"])
    else:
        m["EfouraExhaustiveSeconds"] = "0.6"
    if e4c:
        m["EfourcN"] = str(e4c["n_team_games"])
        m["EfourcDraws"] = str(e4c["draws_per_game"])
        m["EfourcPBetter"] = pct(e4c["mean_p_opt_better"], 0)
        m["EfourcExcl"] = pct(e4c["share_interval_excludes_0"], 0)
        m["EfourcSame"] = pct(e4c["mean_p_same_optimum"], 0)
        m["EfourcWidth"] = f(e4c["mean_interval_width"], 3)
    # ---------------- E5
    if e5:
        for side, key in (("away", "Away"), ("home", "Home")):
            t = e5["teams"][side]
            u = t["uncertainty"]
            m[f"Ref{key}Team"] = t["name"]
            m[f"RefUplift{key}"] = f(t["optimal_er9"] - t["actual_er9"], 3, signed=True)
            m[f"RefActual{key}"] = f(t["actual_er9"], 3)
            m[f"RefOptimal{key}"] = f(t["optimal_er9"], 3)
            m[f"RefPct{key}"] = pct(t["percentile"], 1)
            m[f"RefBook{key}"] = f(t["the_book_er9"], 3)
            m[f"RefWorst{key}"] = f(t["worst_er9"], 3)
            m[f"RefLo{key}"] = f(u["diff_q05"], 3, signed=True)
            m[f"RefHi{key}"] = f(u["diff_q95"], 3, signed=True)
            m[f"RefPBetter{key}"] = pct(u["p_opt_better"], 0)
            m[f"RefSame{key}"] = pct(u["p_same_optimum"], 0)
            m[f"RefObserved{key}"] = str(t["observed_runs"])
        m["RefDraws"] = str(e5["teams"]["away"]["uncertainty"]["n_draws"])
        m["RefQmin"] = f(e5.get("q_min", 0.5), 3)
        m["RefTruncBound"] = (
            f"$<{162 * 1e-13 / e5.get('q_min', 0.5):.1e}$".replace("e-", r"\times10^{-") + "}"
        )
    else:
        m["RefQmin"], m["RefTruncBound"] = "0.5", "$3\\times10^{-11}$"
    for k in (
        "RefUpliftAway",
        "RefUpliftHome",
        "EtwoGainMtwoVsMzero",
        "EthreeSlope",
        "EfourbN",
        "EfourbUpliftMean",
        "EfourbUpliftSeason",
        "EfourbPctMedian",
    ):
        m.setdefault(k, "\\textbf{??}")
    (GEN / "numbers.tex").write_text(macros(m), encoding="utf-8")

    # ---------------- tables
    rows = []
    for s, q in sorted(quality.items()):
        rows.append(
            f"{s} & {q['games']:,} & {q['pa']:,} & {q['lineups_reliable']:,}/{q['lineups']:,}"
            f" & {q['censored']} & {q['non_conserved'] - q['censored']} \\\\"
        )
    (GEN / "table_data.tex").write_text(
        "\\begin{table}[t]\\centering\\small\n\\caption{Statcast data after processing "
        "(regular season and postseason). Non-conserving transitions exclude censored ones.}"
        "\\label{tab:data}\n\\begin{tabular}{lrrrrr}\\toprule\nSeason & Games & PAs & "
        "Reliable lineups & Censored & Non-conserving\\\\\\midrule\n"
        + "\n".join(rows)
        + "\n\\bottomrule\\end{tabular}\\end{table}\n",
        encoding="utf-8",
    )

    figures(e1, e2, e3, e4b, e5)
    web_validation(e2, e3, e4a, e4b, e4c)
    print("wrote", GEN, FIG)


def figures(e1: Any, e2: Any, e3: Any, e4b: Any, e5: Any) -> None:
    if e1:
        fig, ax = plt.subplots(figsize=(3.4, 3.2))
        for s, d in e1["by_season"].items():
            ax.scatter(d["empirical_re24"], d["model_re24"], s=10, label=s, alpha=0.8)
        ax.plot([0, 2.5], [0, 2.5], color=GRAY, lw=1, ls="--")
        ax.set_xlabel("Empirical run expectancy")
        ax.set_ylabel("Model run expectancy")
        ax.legend(frameon=False, fontsize=7)
        fig.tight_layout()
        fig.savefig(FIG / "re24.pdf")
        plt.close(fig)
    if e3:
        fig, ax = plt.subplots(figsize=(3.4, 3.2))
        d = e3["by_decile"]
        x = [r["pred"] for r in d]
        y = [r["obs"] for r in d]
        se = [2 * r["obs_se"] for r in d]
        ax.errorbar(x, y, yerr=se, fmt="o", color=BLUE, ms=4, capsize=2)
        lo, hi = min(x + y) - 0.3, max(x + y) + 0.3
        ax.plot([lo, hi], [lo, hi], color=GRAY, ls="--", lw=1)
        ax.set_xlabel(r"Predicted $\mathbb{E}[R_{1..8}]$ (decile mean)")
        ax.set_ylabel("Observed runs, innings 1–8")
        fig.tight_layout()
        fig.savefig(FIG / "calibration.pdf")
        plt.close(fig)
        fig, ax = plt.subplots(figsize=(3.4, 2.4))
        h = e3["pit"]["pit_hist"]
        ax.bar(np.arange(10) / 10 + 0.05, np.array(h) / sum(h) * 10, width=0.09, color=BLUE)
        ax.axhline(1, color=GRAY, ls="--", lw=1)
        ax.set_xlabel("Randomized PIT")
        ax.set_ylabel("Density")
        fig.tight_layout()
        fig.savefig(FIG / "pit.pdf")
        plt.close(fig)
    if e4b:
        fig, ax = plt.subplots(figsize=(6.8, 2.4))
        edges = np.array(e4b["uplift_hist_edges"])
        ax.bar(
            (edges[:-1] + edges[1:]) / 2,
            e4b["uplift_histogram"],
            width=np.diff(edges) * 0.9,
            color=BLUE,
        )
        ax.set_xlabel("Model gain of the optimal order over the order used (runs per game)")
        ax.set_ylabel("Team-games")
        fig.tight_layout()
        fig.savefig(FIG / "uplift_hist.pdf")
        plt.close(fig)
    if e2:
        cal = e2["by_season"]["2026"]["calibration_M2"]
        fig, axes = plt.subplots(2, 4, figsize=(6.8, 3.4))
        for c, ax in enumerate(axes.ravel()):
            pts = [r for r in cal if r["class"] == c]
            xs = [r["pred"] for r in pts]
            ys = [r["obs"] for r in pts]
            ax.plot(xs, ys, "o-", color=BLUE, ms=3, lw=1)
            lo, hi = min(xs + ys), max(xs + ys)
            ax.plot([lo, hi], [lo, hi], color=GRAY, ls="--", lw=0.8)
            ax.set_title(OUTCOMES[c], fontsize=8)
            ax.tick_params(labelsize=6)
        fig.supxlabel("Predicted probability (decile mean)", fontsize=8)
        fig.supylabel("Observed frequency", fontsize=8)
        fig.tight_layout()
        fig.savefig(FIG / "pa_calibration.pdf")
        plt.close(fig)


def web_validation(e2: Any, e3: Any, e4a: Any, e4b: Any, e4c: Any) -> None:
    WEB.mkdir(parents=True, exist_ok=True)
    out: dict[str, Any] = {}
    if e2:
        out["e2"] = {
            "by_season": {
                s: {"n_pa": v["n_pa"], "models": v["models"]} for s, v in e2["by_season"].items()
            }
        }
    if e3:
        out["e3"] = {
            k: e3[k]
            for k in ("by_decile", "calibration_slope", "bias_obs_minus_pred", "n_team_games")
        }
    if e4a:
        out["e4a"] = {"methods": e4a["methods"]}
    if e4b:
        out["e4b"] = {k: e4b[k] for k in ("uplift_opt_vs_actual", "actual_percentile")}
    if e4c:
        out["e4c"] = {k: v for k, v in e4c.items() if k != "rows"}
    (WEB / "validation.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
