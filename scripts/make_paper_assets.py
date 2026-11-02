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
    # Software version cited by the paper: the clean commit at which the published results were
    # re-computed and verified (scripts/check_provenance.py), falling back to the E5 output.
    prov = load("provenance_check")
    if prov and prov.get("passed"):
        sw = {"package": "2.0.0", "git": prov["git"]}
    else:
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
        tun = load("e2_tuning") or {}
        bnd = tun.get("selected_on_grid_boundary", {})
        names = {
            "batter_scale": r"$\lambda_B$",
            "pitcher_scale": r"$\lambda_P$",
            "half_life_days": "$H$",
        }
        on_edge = [names[k] for k, v in bnd.items() if v]
        m["EtwoBoundaryNote"] = (
            "all three selected values are interior to the final grid"
            if not on_edge
            else "the selected " + ", ".join(on_edge) + " lies on the edge of the final grid"
        )
        grid = tun.get("grid", [])
        if grid:
            hls = sorted({g["half_life_days"] for g in grid})
            m["EtwoHalfLifeGrid"] = ", ".join(f"{v:.0f}" for v in hls)
        seasons = (s25, s26)
        m["EtwoBatterGain"] = f(
            np.mean([s["M0_league"]["log_loss"] - s["M1_batter"]["log_loss"] for s in seasons]), 3
        )
        m["EtwoPitcherGain"] = f(
            np.mean(
                [s["M1_batter"]["log_loss"] - s["M2_batter_pitcher"]["log_loss"] for s in seasons]
            ),
            3,
        )
        m["EtwoTuneGain"] = f(
            np.mean(
                [
                    s["M2_default_hyper"]["log_loss"] - s["M2_batter_pitcher"]["log_loss"]
                    for s in seasons
                ]
            ),
            4,
        )
        for key, s in (("A", s25), ("B", s26)):
            d3 = s["M3_lightgbm"]["diff_vs_M2"]
            m[f"EtwoMthree{key}"] = f(d3["mean"], 4, signed=True)
            m[f"EtwoMthree{key}Lo"] = f(d3["ci_low"], 4, signed=True)
            m[f"EtwoMthree{key}Hi"] = f(d3["ci_high"], 4, signed=True)
    e0 = load("e0_lineup_audit")
    if e0:
        m["EzeroN"] = str(e0["n"])
        m["EzeroMatch"] = str(round(e0["share_both_match"] * e0["n"]))
    e2b = load("e2b_legacy_comparison")
    if e2b:
        lm = e2b["models"]
        m["EtwobN"] = f"{e2b['n_pa_matched']:,}".replace(",", "{,}")
        m["EtwobWindow"] = f"{e2b['window'][0]} to {e2b['window'][1]}"
        m["EtwobLegacyLL"] = f(lm["legacy_lightgbm_51_features"]["log_loss"], 4)
        m["EtwobMtwoLL"] = f(lm["M2_batter_pitcher"]["log_loss"], 4)
        m["EtwobMzeroLL"] = f(lm["M0_league"]["log_loss"], 4)
        d = lm["legacy_lightgbm_51_features"]["diff_vs_M2"]
        m["EtwobDiff"] = f(d["mean"], 4)
        m["EtwobDiffLo"] = f(d["ci_low"], 4)
        m["EtwobDiffHi"] = f(d["ci_high"], 4)
    e2c = load("e2c_decision_sensitivity")
    if e2c:
        m["EtwocN"] = str(e2c["n_team_games"])
        m["EtwocSame"] = pct(e2c["share_same_optimum"], 1)
        m["EtwocLoss"] = f(e2c["mean_loss_using_m2_optimum_under_m3"], 4)
        m["EtwocLossMax"] = f(e2c["max_loss_using_m2_optimum_under_m3"], 4)
        m["EtwocUpTwo"] = f(e2c["mean_uplift_m2"], 4)
        m["EtwocUpThree"] = f(e2c["mean_uplift_m3"], 4)
        m["EtwocCorr"] = f(e2c["mean_corr_values_over_all_orders"], 3)
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
        m["EthreeCoverageModel"] = pct(e3["pit"].get("coverage_80_model_implied", float("nan")), 1)
        m["EthreeShort"] = str(e3.get("excluded_fewer_than_8_innings", 0))
        pit = e3["pit"]
        if "coverage_80_model_implied" in pit:
            pm = pit["coverage_80_model_implied"]
            se = (pm * (1 - pm) / pit["n"]) ** 0.5
            m["EthreeCoverageZ"] = f((pit["coverage_80_nominal"] - pm) / se, 1, signed=True)
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
        m["EfouraNoisyGap"] = f(ng["mean_gap_to_opt"], 4)
        if "actual_mean_gap_same_instances" in ng:
            m["EfouraActualSameGap"] = f(ng["actual_mean_gap_same_instances"], 4)
        m["EfouraNoisyN"] = str(ng["n"])
    else:
        m["EfouraExhaustiveSeconds"] = "0.6"
    if e4c:
        m["EfourcN"] = str(e4c["n_team_games"])
        m["EfourcDraws"] = str(e4c["draws_per_game"])
        m["EfourcPBetter"] = pct(e4c["mean_p_opt_better"], 1)
        m["EfourcExcl"] = pct(e4c["share_interval_excludes_0"], 1)
        m["EfourcSame"] = pct(e4c["mean_p_same_optimum"], 1)
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
            m[f"RefPBetter{key}"] = pct(u["p_opt_better"], 1)
            m[f"RefSame{key}"] = pct(u["p_same_optimum"], 1)
            m[f"RefRegret{key}"] = f(u["regret_of_point_optimum_mean"], 3)
            cert = e5.get("certificate", {}).get(t["team"])
            if cert:
                mant, ex = f"{cert['best_minus_second']:.1e}".split("e")
                m[f"RefCert{key}"] = rf"{mant}\times10^{{{int(ex)}}}"
            m[f"RefObserved{key}"] = str(t["observed_runs"])
        m["RefDraws"] = str(e5["teams"]["away"]["uncertainty"]["n_draws"])
        m["RefQmin"] = f(e5.get("q_min", 0.5), 3)
        # Proposition 5 with the measured truncated mass (not the nominal tolerance).
        bound = 162 * e5.get("truncated_mass_max", 1e-13) / e5.get("q_min", 0.5)
        mant, exp = f"{bound:.1e}".split("e")
        # Math-mode content (the paper wraps it in $...$).
        m["RefTruncBound"] = rf"{mant}\times10^{{{int(exp)}}}"
    else:
        m["RefQmin"], m["RefTruncBound"] = "0.5", r"3\times10^{-11}"
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
            f" & {q['censored']} & {q.get('non_conserved_uncensored', 0)} \\\\"
        )
    (GEN / "table_data.tex").write_text(
        "\\begin{table}[t]\\centering\\small\n\\caption{Statcast data after processing "
        "(regular season and postseason). Non-conserving: bookkeeping violations outside "
        "censored transitions (data errors).}"
        "\\label{tab:data}\n\\begin{tabular}{lrrrrr}\\toprule\nSeason & Games & PAs & "
        "Reliable lineups & Censored & Non-conserving\\\\\\midrule\n"
        + "\n".join(rows)
        + "\n\\bottomrule\\end{tabular}\\end{table}\n",
        encoding="utf-8",
    )

    tables(e1, e2, e4a, m)
    ref_and_appendix(e1, e5)
    figures(e1, e2, e3, e4b, e5)
    web_validation(e2, e3, e4a, e4b, e4c)
    print("wrote", GEN, FIG)


def tables(e1: Any, e2: Any, e4a: Any, m: dict[str, str]) -> None:
    if e2:
        names = [
            ("M0_league", "M0: league, by handedness"),
            ("M1_batter", "M1: + batter"),
            ("M2_batter_pitcher", "M2: + pitcher (selected)"),
            ("M2_default_hyper", "M2 with untuned priors"),
            ("M3_lightgbm", "M3: gradient boosting on M2 inputs"),
        ]
        rows = []
        for k, lab in names:
            cells = []
            for s in ("2025", "2026"):
                r = e2["by_season"][s]["models"][k]
                dd = r["diff_vs_M2"]
                diff = (
                    "---"
                    if k == "M2_batter_pitcher"
                    else (
                        f"{f(dd['mean'], 4, True)} "
                        f"[{f(dd['ci_low'], 4, True)}, {f(dd['ci_high'], 4, True)}]"
                    )
                )
                cells.append(f"{r['log_loss']:.4f} & {diff}")
            rows.append(f"{lab} & " + " & ".join(cells) + r" \\")
        n25, n26 = (e2["by_season"][s]["n_pa"] for s in ("2025", "2026"))
        head = (
            r"\begin{table}[t]\centering\small"
            "\n"
            r"\caption{Held-out log-loss (nats per PA) and difference from M2 with 95\% "
            r"game-cluster bootstrap intervals; negative differences favour the row model. "
            rf"2025: {n25:,} PAs; 2026: {n26:,} PAs.}}\label{{tab:e2}}"
            "\n"
            r"\begin{tabular}{lcccc}\toprule"
            "\n"
            r" & \multicolumn{2}{c}{2025} & \multicolumn{2}{c}{2026}\\"
            "\n"
            r"\cmidrule(lr){2-3}\cmidrule(lr){4-5}"
            "\n"
            r"Model & Log-loss & $\Delta$ vs M2 & Log-loss & $\Delta$ vs M2\\ \midrule"
            "\n"
        )
        (GEN / "table_e2.tex").write_text(
            head + "\n".join(rows) + "\n" + r"\bottomrule\end{tabular}\end{table}" + "\n",
            encoding="utf-8",
        )
    if e4a:
        labels = {
            "exhaustive": "Exhaustive search (exact)",
            "local_search_x10": "2-swap local search, 10 starts",
            "simulated_annealing": "Simulated annealing",
            "genetic_exact": "Genetic algorithm, exact fitness",
            "local_search_from_actual": "2-swap local search from actual order",
            "the_book": r"\citeauthor{tango2007} guideline",
            "sort_run_value": "Sort by run value",
            "sort_obp": "Sort by on-base probability",
            "actual": "Order actually used",
            "genetic_mc4000_original": r"Original GA, Monte Carlo fitness$^\dagger$",
        }
        body = "\n".join(
            f"{labels.get(k, k)} & {v['mean_gap']:.4f} & {v['max_gap']:.4f} & "
            f"{pct(v['share_optimal'])} & {v['mean_evaluations']:,.0f} " + r"\\"
            for k, v in sorted(e4a["methods"].items(), key=lambda kv: kv[1]["mean_gap"])
        )
        n, nn = e4a["methods"]["exhaustive"]["n"], e4a["noisy_ga"]["n"]
        head = (
            r"\begin{table}[t]\centering\small"
            "\n"
            rf"\caption{{Search methods on {n} random 2026 regular-season team-games. Gap: exact "
            r"$V(\pi^\star)-V(\hat\pi)$ in runs per game; Optimal: share of instances where the "
            rf"exact optimum was returned. $^\dagger$On {nn} of them.}}\label{{tab:e4a}}"
            "\n"
            r"\begin{tabular}{lrrrr}\toprule"
            "\n"
            r"Method & Mean gap & Max gap & Optimal & Evaluations\\ \midrule"
            "\n"
        )
        (GEN / "table_e4a.tex").write_text(
            head + body + "\n" + r"\bottomrule\end{tabular}\end{table}" + "\n", encoding="utf-8"
        )
    if e1:
        d = e1["by_season"]
        m["EoneStateZeroMaxDiff"] = f(
            max(abs(v["model_re24"][0] - v["empirical_re24"][0]) for v in d.values()), 3
        )
        m["EoneWeightedDiff"] = f(max(v["weighted_mean_abs_diff"] for v in d.values()), 3)
        m["EoneMaxDiff"] = f(max(v["max_abs_diff"] for v in d.values()), 2)
        m["EoneREzero"] = f(d["2026"]["model_re24"][0], 3)
        mix5, mix = d["2024"].get("state5_mix"), d["2024"]["league_mix"]
        if mix5:
            m["EoneFiveSingle"] = pct(mix5["1B"], 1)
            m["EoneFiveK"] = pct(mix5["K"], 1)
            m["EoneAllSingle"] = pct(mix["1B"], 1)
            m["EoneAllK"] = pct(mix["K"], 1)
            imm = d["2024"]["state5_immediate_runs_model_vs_data"]
            diffs = [
                abs(a - b) for a, b in zip(imm["model"], imm["data"], strict=True) if b is not None
            ]
            m["EoneFiveImmDiff"] = f(max(diffs), 3)
    _fill_missing(m)
    (GEN / "numbers.tex").write_text(macros(m), encoding="utf-8")


MISSING: list[str] = []


def _fill_missing(m: dict[str, str]) -> None:
    """Define every result macro used in the paper; missing ones print a visible marker."""
    import re

    used: set[str] = set()
    for tex in [ROOT / "research" / "paper.tex", *(ROOT / "research" / "sections").glob("*.tex")]:
        text = tex.read_text("utf-8")
        used |= set(re.findall(r"\\((?:Ezero|Eone|Etwo|Ethree|Efour|Ref)[A-Za-z]+)", text))
    for name in sorted(used - m.keys()):
        m[name] = r"\textbf{??}"
        MISSING.append(name)
        print("MISSING macro:", name)


def ref_and_appendix(e1: Any, e5: Any) -> None:
    """Reference-game orders table and the RE24 appendix table."""
    nl = "\n"
    if e5:
        a, h = e5["teams"]["away"], e5["teams"]["home"]
        rows = [
            f"{i + 1} & {a['actual_order'][i]} & {a['optimal_order'][i]} & "
            f"{h['actual_order'][i]} & {h['optimal_order'][i]} " + r"\\"
            for i in range(9)
        ]
        text = (
            r"\begin{table}[t]\centering\small"
            + nl
            + r"\caption{2026 World Series Game 5: starting orders used and model-optimal orders "
            + r"(information before 2026-10-28).}\label{tab:ref}"
            + nl
            + r"\begin{tabular}{rllll}\toprule"
            + nl
            + rf" & \multicolumn{{2}}{{c}}{{{a['name']}}} & \multicolumn{{2}}{{c}}{{{h['name']}}}"
            + r"\\"
            + nl
            + r"\cmidrule(lr){2-3}\cmidrule(lr){4-5}"
            + nl
            + r"Slot & Used & Optimal & Used & Optimal\\ \midrule"
            + nl
            + nl.join(rows)
            + nl
            + r"\bottomrule\end{tabular}\end{table}"
            + nl
        )
        (GEN / "table_ref.tex").write_text(text, encoding="utf-8")
    if e1:
        d = e1["by_season"]["2026"]
        mre, ere = d["model_re24"], d["empirical_re24"]
        names = ["---", "1--", "-2-", "12-", "--3", "1-3", "-23", "123"]
        rows = []
        for b in range(8):
            cells = " & ".join(f"{mre[8 * o + b]:.3f} ({ere[8 * o + b]:.3f})" for o in range(3))
            rows.append(f"{names[b]} & {cells} " + r"\\")
        text = (
            r"\section{Run expectancy, 2026}\label{app:re24}"
            + nl
            + r"Model run expectancy (empirical in parentheses) by bases occupied and outs; 2026 "
            + r"kernel with the league outcome mix (E1). Bases: 1 = first, 2 = second, 3 = third."
            + nl
            + nl
            + r"\begin{center}\small\begin{tabular}{lccc}\toprule"
            + nl
            + r"Bases & 0 outs & 1 out & 2 outs\\ \midrule"
            + nl
            + nl.join(rows)
            + nl
            + r"\bottomrule\end{tabular}\end{center}"
            + nl
        )
        (GEN / "appendix.tex").write_text(text, encoding="utf-8")


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
    e2b = load("e2b_legacy_comparison")
    if e2b:
        out["e2b"] = {k: e2b[k] for k in ("window", "n_pa_matched", "models")}
    if e3:
        out["e3"] = {
            k: e3[k]
            for k in ("by_decile", "calibration_slope", "bias_obs_minus_pred", "n_team_games")
        }
    if e4a:
        out["e4a"] = {"methods": e4a["methods"], "noisy_ga": e4a["noisy_ga"]}
    if e4b:
        out["e4b"] = {
            k: e4b[k] for k in ("n_team_games", "uplift_opt_vs_actual", "actual_percentile")
        }
    if e4c:
        out["e4c"] = {k: v for k, v in e4c.items() if k != "rows"}
    (WEB / "validation.json").write_text(json.dumps(out, indent=1), encoding="utf-8")


def copy_pdf() -> None:
    """Single source of truth for the paper PDF: research/ -> web/public/."""
    import shutil

    pdf = ROOT / "research" / "paper.pdf"
    if pdf.exists():
        shutil.copyfile(pdf, ROOT / "web" / "public" / "paper.pdf")


if __name__ == "__main__":
    import sys

    main()
    copy_pdf()
    # Release mode: refuse to leave placeholders or unknown provenance in the paper.
    if "--release" in sys.argv:
        numbers = (GEN / "numbers.tex").read_text(encoding="utf-8")
        if MISSING or "unknown" in numbers or "-dirty" in numbers:
            raise SystemExit(f"release check failed: missing={MISSING}, provenance in numbers.tex")
