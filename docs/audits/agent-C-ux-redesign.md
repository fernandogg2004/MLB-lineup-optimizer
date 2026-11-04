# Agent C audit of the dashboard redesign, with dispositions

Independent review of `feat/dashboard-redesign` at commit `cd192f5`, 2026-11-04, by the `auditor-ux` agent,
which saw the specification and the code but not the builder's reasoning. Checks: build, unit and e2e suites,
axe in both languages and modes, a 22-size layout sweep, contrast against real pixels, and real screenshots.

The auditor had no real iPhone, Android phone, trackpad or screen reader, and no Firefox or WebKit. Those remain
unverified (see "Open" below).

| ID | Sev. | Finding | Disposition |
|---|---|---|---|
| C-01 | High | Home never says what it is; the site name is invisible | **Fixed.** One-sentence question on the first batter, site name in the bar and menu |
| C-02 | High | Pie caption reads as what happened; "This season so far" is wrong in the postseason | **Fixed.** "The model's forecast…" and "Regular season, before this game" |
| C-03 | High | Summary states estimates as facts | **Fixed.** Heading names the model; conditional verbs. Owner to confirm the wording |
| C-04 | High | Skip link navigates away and resets Home | **Fixed**, with test |
| C-05 | High | Rotating a phone jumps to another batter | **Fixed**, with test. Screen position is remembered; normal-scroll mode updates the address too |
| C-06 | High | Percentile tooltip painted over by the pie caption | **Fixed**, with a hit test at three sizes |
| C-07 | Med | "Model re-runs" can read as games won | **Fixed.** "Re-estimates of the players' ability", and the note states game-to-game variation |
| C-08 | Med | "These are model estimates" appears to include the final score | **Fixed.** Separate lines, with test |
| C-09 | Med | Season figure omits "of this matchup" | **Fixed** |
| C-10 | Med | Unexplained jargon | **Mostly fixed.** Positions spelled out, pitcher options labelled, one-line key for the rings. "AVG" and the others stay as ring labels, as specified; the name appears on hover, focus or tap |
| C-11 | Med | Tooltip clipped on short phones | **Fixed**, with test at 320 and 375 px |
| C-12 | Med | Statistics scrolls behind the open menu | **Fixed**, with test |
| C-13 | Med | Rings and radios break at mid widths | **Fixed.** Breakpoints moved; those sizes added to the layout audit |
| C-14 | Med | Tooltip fails WCAG 1.4.13 | **Fixed.** Esc dismisses it and the pointer can reach it |
| C-15 | Med | Endless motion with no pause (WCAG 2.2.2) | **Open, owner decision.** Stopping the orbit after 5 s changes the approved look. Reduced-motion is honoured, and the scroll hint now stops after four loops |
| C-16 | Med | Invisible focus stop on the scroller | **Fixed.** Not a tab stop in locked mode; visible ring in normal-scroll mode |
| C-17 | Med | Previous screen stays focusable with fractional heights | **Fixed.** Exact heights; only the locked screen is visible. Not retested with the auditor's simulation |
| C-18 | Med | Orbit text too small | **Partly fixed.** Larger, and removed below 600 px wide. At common laptop sizes it renders at about 8 px, not the auditor's 9 px. Decorative: the same name appears on hover, focus or tap |
| C-19 | Med | Spanish "turno al bate" misused | **Fixed.** "Aparición al plato" and "puesto" |
| C-20 | Low | Other Spanish wording | **Fixed**, except a native speaker has not reviewed it |
| C-21 | Low | "Better than more than 99%" | **Fixed**, with test |
| C-22 | Low | Statistics showed 100% where Home says "more than 99" | **Fixed.** Also the same number format in Spanish |
| C-23 | Low | Text-only 200% enlargement clips the summary | **Open.** Normal browser zoom is unaffected, per the auditor's approximation |
| C-24 | Low | Pie label touches the option box at 1280 px | **Fixed**; size added to the audit |
| C-25 | Low | Resizing during a move overshoots | **Fixed**, with test |
| C-26 | Low | Menu edge cases | **Fixed.** Closes on back, Tab wraps, dialog semantics, with test |
| C-27 | Low | Screen-reader refinements | **Partly fixed.** Rail names include the slot, table names the opponent. Slices remain seven tab stops |
| C-28 | Low | One title for all pages; two `h1` on Statistics | **Fixed**, with test. New pages are not announced beyond the title |
| C-29 | Low | Address and preference edge cases | **Fixed.** The fix also closes a race found in testing: settling on a batter could overwrite an address just navigated to |
| C-30 | Low | axe `landmark-unique` | **Partly fixed** on the hitting table; not rechecked on the method page, because the suite audits WCAG tags and this is best practice |
| C-31 | Low | Pie contrast and small visual defects | **Fixed.** Pie outline, darker strikeout slice, less dimming, legend inside its box, more opaque bar |
| C-32 | Low | Possible touch stall | **Partly.** Added `overscroll-behavior`. Needs real-device checking |
| C-33 | Low | Photo credits have no display path | **Fixed.** Shown on Statistics when a photo exists |
| C-34 | Low | Two shortstops in one lineup | **Fixed.** Confirmed in the box score: `position` is where a player ended the game. Home now uses the starting position, and future snapshots will too. Published snapshots are unchanged, so Statistics can still show the end-of-game position for that player |

## Later changes requested by the owner

After reviewing the preview, the owner removed the sentence above the name, the kicker, the fielding position,
the orbiting words and the caption above the rings. So C-01 is now only partly addressed (the site name remains
in the top bar and menu), C-02's ring caption is gone except for unusual cases (a small sample or last season's
numbers), and C-10's spelled-out positions no longer apply. Ring explanations on hover, focus and tap now state
what each statistic measures, which covers part of C-10. This is the owner's decision, recorded here so the
audit stays accurate.

## Open

- Real iPhone Safari, Android and trackpad: only emulated so far.
- Real screen readers, Firefox and WebKit: not tested.
- A native Spanish speaker has not reviewed the copy.
- C-15 and C-23, above.
