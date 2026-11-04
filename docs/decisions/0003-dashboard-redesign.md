# ADR 0003: Dashboard redesign (Home and Statistics)

Date: 2026-11-04. Status: accepted by the project owner, pending final approval of the deployed preview.

## Context

The dashboard served technical readers well but explained little to someone with no baseball
statistics background. The owner specified a new front page and approved a working mockup.

## Decisions

**Two areas behind a menu.** *Home* tells the story one batter at a time for general readers.
*Statistics* keeps all the existing technical content (analysis, simulator, method, paper, code).

**Official hitting lines from the MLB Stats API, not calculated and not scraped from web pages.**
Tested on 2026-11-04: one request returned the whole league for any date range. All 18 starters of
game 849799 agree with our Statcast data (AVG within .0005), and 650 of 660 hitters match exactly on
PA, AB, H and TB, with the largest PA gap being 1. MLB does not publish percentiles, so
`src/batting_order/batter_stats.py` computes them against hitters with at least 200 PA, ending the
day before the game. The Statcast comparison stays as an audit test.

**No "percent better than the real lineup".** The owner removed it. Across the ten team-games available
the true value is 0.22–0.73%, so with whole-number percentages it reads as 0% or 1% nearly everywhere.
The summary reports runs instead, and says plainly that the order used was already near the top.

**Whole-number percentages on Home.** Pie slices use largest-remainder rounding so they total exactly
100. Estimates of certainty are capped at "more than 99", because a model re-run count does not
prove certainty. The Statistics area keeps its existing precision (for example 97.9%): the approved
specification scopes the rule to Home.

**New data lives in new files.** `web/public/data/home/{game_pk}.json` repeats the snapshot fields Home
needs and adds the hitting lines. Game snapshots and `outputs/` are untouched, so the provenance in
`docs/audits/provenance.md` stays valid. A test asserts the copied fields equal the snapshot.

**Illustrated batters, not photographs.** MLB and agency photos are copyrighted and the project does not
use unlicensed assets. The figure is original and faceless. It has six poses plus varied bats and
accessories, chosen from the player id so each player keeps his look. These are decorative: the project has
no reliable source for what a player really wears, and the Statistics page says so. Licensed photos can be added through
`web/public/players/manifest.json`, and a test fails if an image has no licence entry.

**The batter always faces the statistics.** The owner's choice. Direction follows the layout, so the
figure does not show the hitter's real batting side.

**The lock is explicit on wheel and keyboard, native on touch.** Browser snapping alone does not hold:
in testing, one large wheel delta skipped three screens and a small one bounced back. One gesture moves
one screen; a pause of 240 ms between wheel events, read from their timestamps, ends a gesture, so a
busy page cannot split one into several. A trackpad keeps sending events while it coasts after a flick, so
wheel input that picks up again also counts as a new gesture, and a gesture made during a move runs when it
lands. Viewports under 600 px tall (landscape phones) use normal
scrolling, because snapping there would make content unreachable. Rings sit four in a row on phones
under 800 px tall, where a 2 x 2 grid does not fit.

**Motion runs on the compositor.** Only `transform` and `opacity` animate, so nothing repaints while
scrolling. An early design swung the bat; that repainted the whole figure each frame and dropped a
throttled test to 8 fps, so the parallax uses independent layers instead.

**Team colours from a public listing.** teamcolorcodes.com, not the clubs' brand guides, which were not
available. Where a club's two listed colours are too close to read on a small figure, the trim is white
or silver. Tampa Bay's shirt is its light blue, as approved in the mockup review.

**Wording says who is speaking.** The independent review (`docs/audits/agent-C-ux-redesign.md`) found the
approved summary read as observed fact, against this project's invariant. The owner's brief said "something
like", so the wording changed within it: the heading names the model, verbs became conditional, and the real
score sits on its own line, apart from the note about estimates.

**One bundled font.** Inter (SIL Open Font License) ships with the site, because system fonts have different
widths and made some screens overflow on Linux. Layout tests now match what visitors see.

**Owner's refinements after the preview.** Home was simplified at the owner's request: no sentence or kicker
above the name, no fielding position, no orbiting words and no caption above the rings, whose explanation now
appears on hover, focus or tap. This reverses the review's fixes for C-01 and part of C-02 and C-10: the page
no longer says in words what it is, apart from the site name, and the rings are not labelled as past results
on screen. Ring explanations state only what the statistic measures, and the selector reads as a sentence,
"Expected outcome against: Starting pitcher / Bullpen", with each option explained on hover. The forecast card follows the owner's reference image. The rail stays on the
right, and the menu is white in Day.

## Consequences

- `batting-order snapshot` and `update` now also write Home data and need the MLB Stats API. Responses
  are cached, so a rebuild from the cache is identical (tested).
- After experiment E5 rewrites the reference snapshot, run `batting-order home 849799`.
- The site now shows official season hitting lines, credited on the Statistics page.
- Wheel handling overrides the browser's default on Home, which needs checking on real trackpads.
