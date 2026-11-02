# Agent D — Mathematical research and proof audit, round 1

- Date: 2026-11-02 · Target: commit `af9a16a`
- Auditor: independent general-purpose agent with the `auditor-mathematics` definition inlined;
  read-only. Interrupted once by an API rate limit and resumed.

## Verified correct (by the auditor, with numerical checks)

Proposition 1 (coupling; numerically P(N>n)/P(Bin(n,q)≤2) ≤ 1 on the reference matchups);
Lemma 2 (bounds); Proposition 3 (slot crediting matches `_inning`); Theorem 4 (matches
`_game_value`/`evaluate`); Proposition 5 step by step (errors 0.036–0.073 of the bound for tol 1e-1…1e-9;
2.239 vs bound 3.24 on a q = 0.05 out/HR model; RefQmin and RefTruncBound arithmetic);
Proposition 6; Lemma 8 rotations (3.1e-15); Corollary 9; Gamma–Poisson posterior and its
consistency with the multinomial; A4/A5 on the reference kernel (559,161 transitions, q = 0.639/0.633,
runs on third-out plays, triple plays); all result macros against JSON; PIT implementation and
uniformity (χ² ≈ 5.1, 9 df); exhaustive timing 0.63–0.72 s in isolation; certificate margins
8.18e-5 (MIL) and 5.43e-4 (TB) vs 324ε/q ≈ 5.1e-11; bibliography entries.

## Findings

| ID | Severity | Location | Finding | Blocks release? | Confidence |
|---|---|---|---|---|---|
| D-1 | High | results E4a; table_e4a | GA-vs-managers comparison on unmatched samples; on the same 30 games the order used has gap 0.0240 vs GA 0.0223 (= B-1) | Yes | High |
| D-2 | High | Table 1 script; E1 text; §7 | "Non-conserving" column printed negative numbers; true non-censored violations are 0–10 per season, not ~0.05 % | Yes | High |
| D-3 | Medium | Abstract | "under one second" vs 1.40 s reported | Yes | High |
| D-4 | Medium | Conclusions | "best and worst differ by less than a tenth" true only on average (TB: 0.114) | Yes (easy) | High |
| D-5 | Medium | §5.2, abstract | "Exact evaluation removes the bias" — only the Monte Carlo component; selection on estimated parameters remains | Wording | High |
| D-6 | Medium | §7 | "lower bounds on total uncertainty" is not a valid inference | Wording | High |
| D-7 | Low | A4/A5 claim; conservation filter; kernel counting | Out-decreasing transitions would pass the filter; negative runs would be binned as 4 (zero such rows in data) | No | High |
| D-8 | Low | `markov.py` MAX_STEPS; RefTruncBound | Step cap silently truncates (q = 0.004 example: 2,539 vs exact 6,723); bound uses ε instead of measured mass | No | High |
| D-9 | Low | Lemma 2 | Equality R + LOB + 3 = N holds only with LOB defined as the residual | No | High |
| D-10 | Low | Props 1, 3, 6; notation | Index slips; Prop. 6 needs A4 from every state; reused symbols (π, q, b) | No | High |
| D-11 | Low | §5.1 | O(9·81G) should be O(9·9·81G) | No | High |
| D-12 | Low | PDF cross-references | cleveref prints "theorem N" for lemmas/propositions/corollary | No | High |
| D-13 | Low | §3.2 vs `kernel.py` | Window ends at the first of the month, not at d; early-2023 fallback | No | High |
| D-14 | Low | results E5/E4c | "100 %" is 99.5 %; "1 %" is 0.5 % | No | High |
| D-15 | Low | results E1 | "show" overclaims; state description inaccurate; outcome-dependent walk-off censoring not discussed | No | Medium |
| D-16 | Info | §5.2 | Jensen/optimizer's-curse statement vs adaptive GA and measured quantity | No | High |
| D-17 | Low | E4a design text | "ten random starts" is actual + 9 random; heuristic run values differ between E4a/E4b | No | High |
| D-18 | Info | outputs provenance | Mixed git stamps vs cited 07d570c | Coordinate | High |
| D-19 | Low | Intro/references | log5 credited to Tango (Bill James 1981); "ten runs" claim unverified; `savant` uncited | No | Medium |
| D-20 | Info | E2 tuning | H = 365 on the final grid's boundary; first grid not archived (= B-4) | No | High |
| D-21 | Info | Corollary 9 | Certificate gap Δ never reported; floating-point rounding outside the bound | No | High |
| D-22 | Info | Objective, A3, w_k | V is a plug-in value; independence across innings is a simplification; w_k interpretation relies on A3 | No | High |

Resolutions: `docs/audits/findings-register.md`.
