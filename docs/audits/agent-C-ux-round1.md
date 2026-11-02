# Agent C — UX, web design and data-explainability audit, round 1

- Date: 2026-11-02 · Target: live production build https://batting-order-lab.vercel.app (git `8bbf0a7`)
- Auditor: independent general-purpose agent with the `auditor-ux` definition inlined
  (project agent definitions are only loaded at session start). Read-only; scripts and
  screenshots kept in the auditor's temp directory.
- Method: Playwright on the live site, 1280 px and 375 px, EN/ES, light/dark, reduced motion;
  axe-core 4.10.2; focus sweeps; simulator interaction including races during search.

## Summary table

| ID | Severity | Location | Finding | Blocks release? | Confidence |
|---|---|---|---|---|---|
| C-1 | High | Lineups, KPIs, uncertainty card | "Model-optimal" order presented as a definite recommendation although the same exact order is optimal in only 0.25 % of posterior draws (displayed "0%"); mean regret of the point optimum (0.013) exceeds its claimed gain (+0.010) | No (strongly recommended) | High |
| C-2 | High | Simulator, edits during a running search | Search completion overwrites newer edits; a lock set during the search is displayed on a different player and the result claims to honour constraints it did not | **Yes** | High (reproduced) |
| C-3 | Medium | Simulator arrows / drag near locked slots | Moves into or across a locked slot silently do nothing; button stays enabled | No | High |
| C-4 | Medium | Simulator focus | Moving a hitter to slot 1/9 disables the focused button; focus falls to `<body>` | No | High |
| C-5 | Medium | dnd-kit screen-reader text | English-only, internal ids in announcements | No | High |
| C-6 | Medium | Workload slider | Stale "Best order…" message after moving slider; ambiguous "(historical workload)" label | No | High |
| C-7 | Medium | Sticky header at 375 px | 174 px tall; focused elements hidden beneath it (WCAG 2.4.11) | No | High |
| C-8 | Medium | Badges, link buttons, dark primary button | Text contrast 4.30:1 and 3.63:1 (WCAG 1.4.3) | No | High |
| C-9 | Medium | Histogram / PMF bars | Bar fill 1.29:1 vs background (WCAG 1.4.11) | No | High |
| C-10 | Medium | SVG charts at 375 px | Tick text renders at ~5–7 px | No | High |
| C-11 | Medium | Lineup-value histogram | 0.054-run axis exaggerates differences without on-chart scale context | No | Medium |
| C-12 | Medium | "Why…" panel chart | Titled "per player" but plotted per slot; series nearly identical | No | High |
| C-13 | Medium | Simulator interval | Interval of absolute level (0.9 runs wide) instead of paired difference; draw count differs from card | No | Medium |
| C-14 | Medium | Simulator at 375 px | Player names truncated, position hidden | No | High |
| C-15 | Medium | Spanish localisation | Data strings in English, inconsistent number/percent formats, ISO dates, ASCII minus | No | High |
| C-16 | Medium | Hero | Yes/no question not answered in plain language | No | Medium |
| C-17 | Medium | Method page | e4c uncertainty results not shown; unlabeled Δ columns; jargon without takeaways | No | High |
| C-18 | Low | Team tabs | ARIA tab pattern incomplete | No | High |
| C-19 | Low | Headings | h1→h3 jumps; method page order | No | High |
| C-20 | Low | Lock button | Accessible name concatenated, no player name; load/reset silently clear locks | No | High |
| C-21 | Low | Small targets, scroll regions | Target size; scrollable tables not focusable | No | Medium |
| C-22 | Low | Scoreboard / chart names | `aria-label` on role-less div ignored; chart names are axis labels | No | High |
| C-23 | Low | Method page | Sample sizes of e4a vs e4b not labelled | No | High |
| C-24 | Info | Misc. | `?lang=` not updated on toggle; PDF language not indicated; `sim.infeasible` unreachable; picker hidden with one game | No | High |

## Auditor's details (condensed, evidence preserved)

- **C-1** `GameView.tsx:201` shows `pct(0.0025)` as "0%"; MIL `regret_of_point_optimum_mean = 0.0131`;
  top-10 orders within 0.0007 runs; recommended leadoff leads off in only 21 % of draws. Fix: stability
  sentence in the lineup card, per-slot stability, "<1%" formatting, rename to "top order (one of many
  near-ties)".
- **C-2** `Simulator.tsx:155-161`: worker not cancelled and request id not bumped when the user edits;
  `setOrder(m.best)` overwrites. Fix: cancel on every edit or lock the UI during search with a Cancel button.
- **C-3** `Simulator.tsx:114` returns early when the target is locked (contradicts comment at 116).
  Fix: arrows skip to the next unlocked slot; disable with an explanation when none exists.
- **C-4** Row keyed by player; the clicked button becomes disabled. Fix: move focus within the row.
- **C-5** `DndContext` lacks localised `accessibility.announcements/screenReaderInstructions`.
- **C-6** Slider `onChange` does not reset the search result; label ambiguity.
- **C-7** Header wraps to three lines at 375 px; 14 focus targets obscured. Fix: non-sticky on small
  screens or single-row header; `scroll-padding-top`.
- **C-8/C-9** Tokens in `index.css`; propose darker accent for text and ≥3:1 bar fill.
- **C-10** Fixed 640/1000-wide viewBoxes scaled to ~300 px.
- **C-11** Add on-chart scale context (range vs one game's ±2.7 runs).
- **C-12** Plot per player with used vs optimal PA.
- **C-13** Show the paired difference (your order − order used) over the same draws.
- **C-14** Two-line layout or icon-only controls under 480 px.
- **C-15** Localise series name and handedness, consistent grouping, `pct()` everywhere, localised dates, `signed()`.
- **C-16** Plain verdict first ("Nearly. Both lineups were in the top 3 %…").
- **C-17** Add an e4c card; sub-headers for Δ columns; one-line takeaways.
- **C-18…C-24** See table; standard fixes (roving tabindex or pressed buttons, heading levels,
  `aria-label` per lock with player and slot, padding and focusable scroll regions, `role="group"`
  and descriptive chart names, sample-size captions, `history.replaceState` on language toggle,
  "(in English)" for the PDF link).

Auditor's release-blocker assessment: only C-2.

## Resolution (filled in by the maintainers)

See `docs/audits/findings-register.md`.
