# Prompt: redesign the Batting Order Lab dashboard

**Status: implemented.** Kept as the record of what the owner specified. The mockup source files it lists
were deleted on completion, and `docs/decisions/0003-dashboard-redesign.md` records where the build differs
(for example, the bat does not move separately, for performance).

Line references are to commit `ccfb5dc`. Re-check them before relying on them.

---

You are redesigning the public dashboard in `web/` (live at https://batting-order-lab.vercel.app).
The goal is a perfect **Home** experience for people who know nothing about the model, plus a
**Statistics** area that keeps all the existing technical content in the same visual style.

Read first: `CLAUDE.md`, `web/src/App.tsx`, `web/src/data.ts`, `web/src/strings.ts`,
`web/src/views/*`, `web/e2e/app.spec.ts` and `docs/audits/findings-register.md`.
Use the `dataviz` skill before writing chart code.

**Start from the approved mockup, not from scratch:**

| File | What it is |
|---|---|
| `docs/prompts/mockups/mockup.html` and `*.png` | Target look and behaviour (single file; open it directly) |
| `web/src/mockup/main.tsx`, `mockup.css` | Mockup source: layout, pie, summary, menu, scroll lock. Reuse it, but move it into real components |
| `web/src/components/ui/orbit-ring-stats.tsx` and `orbit-ring-stats-utils/orbit-ring-stats.css` | Ring component, already recreated |
| `web/src/components/ui/batter-figure.tsx` | Illustrated batter, already drawn |
| `web/mockup.html`, `web/vite.mockup.config.ts`, `web/src/mockup/mockup-data.json` | Mockup-only. **Delete when Home is finished.** The JSON is exploratory; production data comes from section 2 |

## 1. Non-negotiable rules

1. **Honest numbers.** Everything for a game on date `d` uses only information from before `d`. Differences between
   orders are model quantities, never observed effects. The real final score is never presented as an
   expected value and never used in a calculation.
2. **No numbers in code or copy.** Every figure comes from generated JSON. Every string exists in
   English and Spanish (`web/src/strings.ts`).
3. **Percentages never show decimals**, anywhere on Home. Display `0%` and `100%` only when exactly
   true. Otherwise use "less than 1" and "more than 99". Runs may show two decimals, because one decimal would make
   3.83 and 3.84 look identical.
4. **Never show a "percent better than the real lineup" figure, on any screen.** The owner removed it: across the
   10 team-games available the true value is 0.22–0.73%, so it would read as 0% or 1% nearly everywhere.
5. **Do not touch** `src/batting_order/engine/`, `model/`, `web/src/engine/`, the game snapshots or
   `outputs/`. Do not bump `SUPPORTED_SCHEMA`. New data goes in new files, so the verified provenance in
   `docs/audits/provenance.md` stays valid.
6. **Assets.** No MLB, agency or club photos or logos unless a licence is recorded (section 5).
7. **Cost and dependencies.** $0. Permissively licensed dependencies only, and justify each one.
8. **Git.** Work on a branch, open a PR, and do not merge or deploy to production until the owner approves.

## 2. Data sources

### Already computed: use these, do not recompute

| On screen | Field in `web/public/data/games/{pk}.json` | Calculated at |
|---|---|---|
| Order chosen by the model | `teams.*.optimal.order` (`order[slot]` = index into `hitters`) | `exhaustive`, `src/batting_order/engine/markov.py:301`; stored at `src/batting_order/snapshot.py:143` |
| Name, field position, slot in the order actually used | `hitters[i].name`, `.pos`, `.slot` | `official_lineups`, `src/batting_order/data/statsapi.py:93`; stored at `snapshot.py:108-110` |
| Pie: vs starter | `hitters[i].probs_starter` | `build_matchup`, `src/batting_order/model/matchup.py:29-31`; `Snapshot.vs_pitcher`, `src/batting_order/model/pa_model.py:126` |
| Pie: vs bullpen | `hitters[i].probs_bullpen` | `matchup.py:32`; `Snapshot.vs_bullpen`, `pa_model.py:129` |
| Outcome classes | `model.outcomes` = K, BB, 1B, 2B, 3B, HR, GB, AIR | `src/batting_order/data/plate_appearances.py:29-73` |
| Opposing starter | `opponent_starter.name` | `snapshot.py:126-131` |
| Expected runs, model's order | `optimal.er9` | `markov.py:301`; `snapshot.py:144` |
| Expected runs, order used | `actual.er9` | `evaluate`, `markov.py:176`; `snapshot.py:136` |
| Expected runs, worst order | `worst.er9` | `snapshot.py:150` |
| How the order used ranks | `actual.percentile` | `snapshot.py:140` |
| Number of possible orders | `all_orders.count` | `snapshot.py:152` |
| Lower end of the 90% gain interval | `uncertainty.diff_q05` | `snapshot.py:101,161` |
| Chance the model's order is better | `uncertainty.p_opt_better` | `snapshot.py:163` |
| Distribution of runs | `optimal.run_distribution` | `run_distribution`, `markov.py:314`; `snapshot.py:121,147` |
| Expected plate appearances per slot | `optimal.pa_by_slot` | `_expected_pa`, `markov.py:197`; `snapshot.py:146` |
| Final score (context only) | `game.away_runs`, `game.home_runs` | `statsapi.py:93`; `snapshot.py:238-239` |

Do **not** use these as the rings:
- `hitters[i].obp` is a model on-base probability (`src/batting_order/optimize/search.py:74`).
- `hitters[i].history_pa` is a decayed effective count, not real plate appearances.

### AVG, OBP, SLG, OPS: pull from the official MLB Stats API

**Decision: use the official API, not our own calculation and not page scraping.** The owner proposed this and a test confirmed it.

| | Official Stats API (chosen) | Calculate from our Statcast data | Scrape a stats website |
|---|---|---|---|
| Numbers | The official ones | Could differ slightly | Official or third-party |
| Effort | One request returns the whole league | Formula code to maintain | Fragile parser, may break terms of use |
| Any cutoff date | Yes (`byDateRange`) | Yes | Usually not |
| Already in the project | Yes (`StatsApi`) | Yes | No |

Measured on 2026-11-04:
- One request took about 3 seconds and returned 751 players.
- All 18 starters of game 849799 match our Statcast data over the same dates, with AVG within .0005 (rounding).
- Of 660 hitters, 650 match exactly on PA, AB, H and TB; the largest PA gap is 1. At a 2026-06-30 cutoff, 576 of 585 match exactly.

Request, through the existing cached client (`StatsApi.get`, `src/batting_order/data/statsapi.py:34`):

```
GET https://statsapi.mlb.com/api/v1/stats
    ?stats=byDateRange&group=hitting&gameType=R&sportIds=1&playerPool=ALL&limit=3000
    &season={season}&startDate={season}-03-01&endDate={d minus one day}
```

Read `plateAppearances`, `avg`, `obp`, `slg`, `ops` from `stats[0].splits[*].stat`, keyed by `splits[*].player.id`. Show these strings exactly as returned.

Add `src/batting_order/batter_stats.py`:
- **Window:** regular season of the game's season, ending the day before the game. Never later.
- **Percentile:** share of the pool with a strictly lower value, as a whole number, clamped to 1–99. **MLB does not provide this, so we compute it.**
- **Pool:** batters with at least 200 PA at the cutoff. If the pool has fewer than 100 batters (early season),
  use the previous full regular season and label it on screen. A batter under 200 PA is still ranked against the pool and flagged "small sample".
- **Credit** the data source on Statistics. The response carries an MLB Advanced Media copyright notice and the project already uses this API as non-commercial research (`statsapi.py:8`).

Reference check: 2026 regular season, pool of 361. Brice Turang: 680 PA, .268/.366/.450/.816, percentiles 78/93/77/84.

Tests required:
- Percentile, clamping, ties and pool fallback, on hand-built data.
- A test that `endDate` is always before the game date.
- An audit test comparing the API with `data/processed/transitions_{season}.parquet` (events at `plate_appearances.py:29-56`) for the 18 starters of game 849799: PA within 1 and AVG within .002.
  Differences beyond that must be explained in `docs/audits/`.

Generate `web/public/data/home/{game_pk}.json`: the batting lines plus only the snapshot fields Home needs,
without `draws_x` (the full snapshots are 0.6–1.1 MB). A test must assert that copied fields equal the snapshot.
Wire generation into `batting-order snapshot` and `batting-order update` (`src/batting_order/cli.py`), and document it in `docs/operations.md`.

### Derived on Home (pure, unit-tested functions in `web/src/home/derive.ts`)

| Value | Formula |
|---|---|
| Runs gained per game | `optimal.er9 - actual.er9` |
| Over a season | `(optimal.er9 - actual.er9) * 162`, rounded to a whole number, described as "over 162 games" of this matchup |
| Biggest move | the slot `s` that maximises `abs(optimal.order[s] - s)`; ties go to the earlier slot |
| Chance of scoring at least once | `1 - optimal.run_distribution[0]` |
| Chance of 5+ runs | sum of `optimal.run_distribution[5:]` |
| Best-to-worst gap | `optimal.er9 - worst.er9` |
| Pie rounding | largest-remainder method over the displayed slices, so they always total exactly 100 |

## 3. Navigation

- A thin fixed top bar: the three-line icon at top left, then the **match** selector and **team** selector (positions as in the mockup).
  On phones, shorten the match label so the game number stays visible ("G5 · MIL 4–1 TB"). The mockup still cuts it off.
- The icon opens a panel from the left: near-black at about 85% opacity, width `min(320px, 85vw)`, with the page visible behind it.
- Two lines in white, in a legible sans at normal size: **Home** (default page; "Inicio" in Spanish) and **Statistics** ("Estadísticas").
- One soft glow marks the current page. It glides to whichever item is hovered or keyboard-focused, and returns on leave.
- The panel's bottom left holds two plain selectors, stacked: appearance (`Night · Day` / `Noche · Día`) and language (`EN · ES`). They mark the active choice with an underline and do not glow on hover.
- The panel looks the same in both modes: near-black with white text.
- Esc, the panel's icon, or a click outside closes it. Trap focus inside and return it to the icon on close. Lock page scroll while open.
- URLs: `#/`, `#/g/{pk}/{team}/{slot}` (slots 1–9, or `summary`), `#/statistics`. Redirect the old `#/game/{pk}` and `#/method`.
- Changing match or team returns to batter 1, with a clear transition. Default: reference game (`index.json`), away team.

## 4. Home

### Structure

Nine batter screens in the model's order, then the summary. Below the top bar:

```
odd slots:   [ picture 1/3 ][ stats 2/3 ]
even slots:  [ stats 2/3 ][ picture 1/3 ]
```

**Picture column:** a one-line kicker "The model's best order for {team} · {n} of 9", then "1st. {name}", then the field position.
On the same line, explain the move: "Batted 5th in the real lineup" or "Same spot as in the real lineup".
On desktop this text block is **centred above the picture**, with the figure starting right below it. On phones it stays left-aligned beside the small figure.

**Stats, first row:** four rings (AVG, OBP, SLG, OPS). The value (`.275`) is in the centre, the label above, and the arc is the percentile.
The exact percentile is below ("91st percentile" / "percentil 91"), with the plain meaning available on hover, focus or tap ("better than 91% of hitters").
Add one visible caption above the row: "This season so far". Orbiting words carry the full stat name in the current language.

**Stats, second row:** the outcome pie, centred under the rings (the option box must not push it off-centre), with a box next to it: "Expected outcome against: ◉ {starter name} ○ Bullpen".
Add the caption "Each trip to the plate in this game". The choice persists across batters.

Slices (all labelled directly, no hover needed, leader lines for small ones):
Strikeout (K) · Walk or hit by pitch (BB) · Single (1B) · Double or triple (2B+3B) · Home run (HR) · Ground ball, no hit (GB) · Fly or line drive, no hit (AIR).
Triples are merged because they round to 0% for nearly every hitter (0.7% at most in game 849799). Statistics keeps all eight classes.
Show the no-hit and strikeout slices in neutral tones and the reaching-base slices in the accent family, so "how often he reaches base" reads at a glance.
On hover, keyboard focus or tap, the slice brightens slightly and its label is emphasised.

The chart needs a screen-reader equivalent (a visually hidden table).

### Ring component

Use `web/src/components/ui/orbit-ring-stats.tsx` as delivered. It keeps the supplied design (turning gradient arc, rolling digits, orbiting words that slow on hover, flood that inverts the number) and adds what this page needs:
- `display` sets the centre text independently of `value` (the percentile, `max` 100).
- `active` lets the parent start and replay the reveal. Pass it for the locked batter only. Without it, stacked screens would all fire at once.
- The orbit loop runs only while active, and a new `rings` array does not reset the angles.

Do not install the shadcn CLI: it would alter `index.css` and its design tokens. No path alias is needed either.
Check that the orbit text is legible at each rendered size, and remove it at any size where it is not.

### Scrolling and the lock

The lock means **one gesture moves exactly one screen**, whatever its size or speed. Browser snapping alone does **not** achieve this: in testing, one large wheel delta skipped three screens and a small one bounced back. Implement it as the mockup does:

- **Wheel:** handle it with a non-passive listener. Advance one screen per gesture, and treat a pause of about 160 ms as the end of a gesture so trackpad inertia cannot advance a second screen.
- **Keyboard:** Arrow keys, Page keys, Space, Home and End. Ignore them while focus is in a selector, input or the menu.
- **Touch:** native `scroll-snap-type: y mandatory` with `scroll-snap-stop: always`, one 100svh target per screen.
- Disable snapping during a scripted move (about 850 ms, eased), then restore it.

Tie the visuals to scroll position:
- The outgoing batter fades and drifts as it leaves. The incoming one assembles as it settles.
- Layers move at different speeds (far background, midground, picture, stats). Animate `transform` and `opacity` only.
- "Locked" means position is within about 2% of a whole screen. Only then do rings sweep and numbers settle.

Add a slim progress rail with nine markers on the edge opposite the picture (click to jump, with the hitter's name as label), plus a marker that skips to the summary.

On mobile, keep the same sequence but stack: small picture band, 2×2 rings, pie. **Every screen must fit without inner scrolling**, because snapping makes overflowing content unreachable.
If a viewport cannot fit it (short landscape phones), turn the lock off and use normal flow.

With `prefers-reduced-motion`: no parallax, reels or orbit. Use short crossfades and show final values at once. Without JavaScript or data, show a clear message.

### Summary screen

Centred, legible, on the same stage. Heading: "This lineup…". Numbers roll while scrolling in and land on the true value at the lock, with a smooth deceleration.
Screen readers get only the final text, and the value must be correct before the animation starts.

1. **expects {optimal.er9} runs** this game.
2. **moves {name} up/down from {real slot} to {new slot}**, its biggest change.
3. **sends its first hitter to the plate {pa_by_slot[0]} times and its ninth {pa_by_slot[8]} times.**
4. **adds +{gain} runs a game, about {season} over 162 games.**
5. **beats the real lineup in {p_opt_better} of 100 model re-runs.** When `diff_q05 <= 0`, add ", so the model is not certain of the gain".
6. **scores at least once in {p}% of games, and five or more in {q}%.**

Then a context line: "The real order was already better than {actual.percentile}% of the {all_orders.count} possible orders. The best and worst of them are only {gap} runs apart."

Then, smaller: "Final score: {away} {r}–{r} {home}. These are model estimates. A single game cannot prove or disprove a batting order." Then a link to Statistics.

### Background and appearance

**The owner approved the mockup's stadium background. Do not offer alternatives.** It has two modes, implemented as a `data-theme` attribute on the root element:

- **Night (default):** near-black sky, soft floodlight cones, a dark green outfield arc.
- **Day:** the same composition in sunlight: blue sky, soft white shafts, a bright green outfield arc.

The visitor's choice is remembered in `localStorage`. Every colour lives in a theme token, including the pie's fill, stroke and leader lines, and the rings (`theme="night"` or `"paper"`).

Rings, chart, menu and text must share one type system, one palette and one glow treatment. Measure text contrast against the real background pixels in both modes, as the mockup check did: render the background alone, then compare each text element's colour with the pixels behind it. Everything must meet WCAG AA.

Make the background and picture layers move more visibly during scrolling than they do in the mockup: its background is static.

Reference for feel: https://delassus.com/en/ (see the `/en/about` page). Take its layered depth, restraint, and cards overlapping images. Do not copy its assets, fonts or layout.

## 5. Player pictures

Use `web/src/components/ui/batter-figure.tsx`: an original, faceless illustrated batter, with the bat in its own group (`.bf-bat`) for parallax. Do not generate images imitating real players' faces.

- **Facing:** the batter **always looks towards the statistics**: `facing="right"` when the picture is on the left, `facing="left"` when it is on the right, and `facing="left"` on phones. This is decided by layout, so the figure does not show the hitter's real batting side.
- **Team colours:** `shirt` colours the shirt, helmet and socks, and `accent` colours the trim, of the team being shown. Keep them in one config file covering all 30 clubs, checked against an official MLB source. The mockup's values are from memory: MIL `#12284b` / `#ffc52f`, TB `#8fbce6` / `#092c5c`.
- **Dark colours at night:** keep the floodlight glow behind the figure and the thin light edge on its shapes, so navy stays visible. Check every club in both modes.

Support optional real photos through `web/public/players/manifest.json`, with one entry per player: `{id, file, author, source, license}`. A test must fail if an image has no licence entry, and credits must be visible in Statistics.

## 6. Statistics page

Move everything from `GameView`, `Simulator` and `MethodView` here, along with the paper PDF, repository link and data notes, with sub-navigation and the new visual style.
**No content or capability is removed.** Existing wording about uncertainty and counterfactuals stays, unless replaced by something equally accurate. Add a table of the rings' definitions, source and pool rules.

## 7. Verification (execute it and report the results)

- `npx tsc -b`, `npx vitest run`, `npx playwright test`, `npm run lint`; `pytest -m "not slow"`, `ruff check src tests scripts`, `mypy`.
- Unit tests over **every hitter, both regimes, all games**: pie totals exactly 100.
- A DOM test on every Home screen: no percentage contains a decimal, and no "percent better" figure appears. Check both languages.
- Playwright:
  - lock: one 3000 px wheel event moves one screen; one 100 px event moves one screen; a continuous 25-event gesture moves one screen; wheel past the end stays put; keyboard moves one screen; a real touch flick (`Input.dispatchTouchEvent`, because `synthesizeScrollGesture` did not move the page in testing) moves one screen;
  - deep links and the back button work; changing match or team resets correctly; picture sides alternate;
  - the menu and glow work; language switching works without losing position.
- An automated layout audit of all screens, both teams, both languages and both appearance modes at 1440×900, 1366×650, 1920×1080, 768×1024 and 390×844: nothing outside the viewport, no overlapping labels. Inspect screenshots as well.
- **Manual check on real hardware, which automated tests cannot replace:** a trackpad, an iPhone in Safari, and an Android phone. Report which were actually tested.
- On all nine screens: the batter faces the statistics, and the name is centred over the picture within 2 px on desktop.
- The appearance choice applies to every screen and survives a reload. Team colours change with the selected team.
- Accessibility audit (axe) and reduced-motion run. Measure frame rate during scrolling with CPU throttling and report it. Keep the added JS under 60 KB gzipped, or justify the excess.
- Update the e2e suite to the new structure without weakening its assertions. Engine parity tests must pass untouched.
- Finish with an independent `auditor-ux` review and record the findings in `docs/audits/`.

## 8. Deliverables, in order

1. A short plan and a list of assumptions.
2. Data layer and tests, including the API audit result.
3. Full Home, then Statistics. Delete the mockup files.
4. PR with a Vercel preview URL, screenshots, verification output and known limitations. **Wait for approval before merging or deploying to production.**
