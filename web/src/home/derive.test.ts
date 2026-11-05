import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { HomeData } from "../data";
import { validateHome } from "../data";
import { homeHash, parseHash, statsHash } from "../route";
import { dictionaries } from "../strings";
import {
  bestToWorstGap,
  biggestMove,
  chanceOfFivePlus,
  chanceOfScoring,
  ordinal,
  pieSlices,
  roundTo100,
  runsGained,
  runsOverSeason,
  sameOrder,
  splitTemplate,
  wholePercent,
} from "./derive";
import { POSES } from "../components/ui/batter-poses";
import { figureFor, lineupFigures } from "./figures";
import { contrast, DEFAULT_KIT, kitFor, TEAM_KITS } from "./teams";

const HOME_DIR = join(process.cwd(), "public", "data", "home");
const games: HomeData[] = readdirSync(HOME_DIR).map((f) => JSON.parse(readFileSync(join(HOME_DIR, f), "utf-8")) as HomeData);

describe("pie rounding", () => {
  it("largest remainder totals 100 and stays within one point of the exact value", () => {
    const p = [0.259, 0.083, 0.15, 0.037, 0.003, 0.023, 0.248, 0.197];
    const r = roundTo100(p);
    expect(r.reduce((a, b) => a + b, 0)).toBe(100);
    r.forEach((v, i) => expect(Math.abs(v - p[i] * 100)).toBeLessThan(1));
  });

  it("every hitter, both regimes, all games: slices total exactly 100", () => {
    expect(games.length).toBeGreaterThan(0);
    let pies = 0;
    for (const g of games) {
      validateHome(g);
      for (const t of Object.values(g.teams)) {
        for (const h of t.hitters) {
          for (const p of [h.probs_starter, h.probs_bullpen]) {
            const s = pieSlices(p);
            expect(s).toHaveLength(7);
            expect(s.reduce((a, x) => a + x.percent, 0)).toBe(100);
            for (const x of s) {
              expect(Number.isInteger(x.percent)).toBe(true);
              expect(Math.abs(x.percent - x.value * 100)).toBeLessThan(1);
            }
            pies++;
          }
        }
      }
    }
    expect(pies).toBe(games.length * 2 * 9 * 2);
  });

  it("marks a tiny slice instead of calling it zero", () => {
    const s = pieSlices([0.3, 0.1, 0.1, 0.05, 0.001, 0.002, 0.25, 0.197]);
    const hr = s.find((x) => x.key === "hr");
    expect(hr?.percent).toBe(0);
    expect(hr?.belowOne).toBe(true);
  });

  it("merges doubles and triples", () => {
    expect(pieSlices([0.2, 0.1, 0.1, 0.06, 0.01, 0.03, 0.25, 0.25]).find((x) => x.key === "xbh")?.value).toBeCloseTo(0.07);
  });
});

describe("whole percentages", () => {
  it("never shows 0 or 100 unless exactly true, and caps certainty", () => {
    expect(wholePercent(0)).toEqual({ kind: "exact", n: 0 });
    expect(wholePercent(0.004)).toEqual({ kind: "less", n: 1 });
    expect(wholePercent(0.912)).toEqual({ kind: "exact", n: 91 });
    expect(wholePercent(0.995)).toEqual({ kind: "more", n: 99 });
    expect(wholePercent(1)).toEqual({ kind: "more", n: 99 });
  });
});

describe("summary values", () => {
  const team = games.find((g) => g.game.game_pk === 849799)!.teams.away;

  it("uses expected runs only, never the real score", () => {
    expect(runsGained(team)).toBeCloseTo(team.optimal.er9 - team.actual.er9, 12);
    expect(runsOverSeason(team)).toBeCloseTo((team.optimal.er9 - team.actual.er9) * 162, 12);
    expect(bestToWorstGap(team)).toBeCloseTo(team.optimal.er9 - team.worst.er9, 12);
    expect(JSON.stringify(team)).not.toContain("observed_runs");
  });

  it("reads scoring chances from the run distribution", () => {
    const d = team.optimal.run_distribution;
    expect(chanceOfScoring(team)).toBeCloseTo(1 - d[0], 12);
    expect(chanceOfFivePlus(team)).toBeCloseTo(d.slice(5).reduce((a, b) => a + b, 0), 12);
  });

  it("finds the biggest move, with ties going to the earlier slot", () => {
    expect(biggestMove([4, 1, 3, 0, 6, 2, 7, 5, 8])).toEqual({ hitter: 4, from: 4, to: 0 });
    expect(biggestMove([1, 0, 2])).toEqual({ hitter: 1, from: 1, to: 0 });
    expect(biggestMove([0, 1, 2])).toBeNull();
    expect(sameOrder([0, 1, 2])).toBe(true);
    expect(sameOrder([1, 0, 2])).toBe(false);
  });
});

describe("text helpers", () => {
  it("writes ordinals in both languages", () => {
    expect([1, 2, 3, 4, 9, 11, 12, 13, 21, 22, 23, 91].map((n) => ordinal(n, "en"))).toEqual([
      "1st", "2nd", "3rd", "4th", "9th", "11th", "12th", "13th", "21st", "22nd", "23rd", "91st",
    ]);
    expect(ordinal(5, "es")).toBe("5.º");
  });

  it("splits templates around placeholders", () => {
    expect(splitTemplate("expects {runs} runs.")).toEqual([{ text: "expects " }, { slot: "runs" }, { text: " runs." }]);
  });

  it("no copy on Home mentions a percent-better comparison", () => {
    for (const d of Object.values(dictionaries)) {
      for (const [k, v] of Object.entries(d)) {
        if (k.startsWith("sum.") || k.startsWith("home.")) expect(v, k).not.toMatch(/%\s*(better|mejor)|\{[a-z_]+\}\s*%/i);
      }
    }
  });
});

describe("routes", () => {
  it("round-trips Home deep links", () => {
    expect(parseHash(homeHash(849799, "TB", 3))).toEqual({ page: "home", pk: 849799, team: "TB", screen: 3 });
    expect(parseHash(homeHash(849799, "TB", 9))).toEqual({ page: "home", pk: 849799, team: "TB", screen: 9 });
  });
  it("treats unknown input as the front page", () => {
    expect(parseHash("")).toEqual({ page: "home", screen: 0 });
    expect(parseHash("#/")).toEqual({ page: "home", screen: 0 });
    expect(parseHash("#/nonsense")).toEqual({ page: "home", screen: 0 });
    expect(parseHash("#/g/abc/TB/99")).toEqual({ page: "home", pk: undefined, team: "TB", screen: 0 });
  });
  it("redirects the previous site's links", () => {
    expect(parseHash("#/method")).toEqual({ page: "statistics", tab: "method" });
    expect(parseHash("#/game/849802")).toEqual({ page: "statistics", tab: "game", pk: 849802 });
  });
  it("builds Statistics links", () => {
    expect(statsHash("method", 1, "TB")).toBe("#/statistics/method");
    expect(parseHash(statsHash("simulator", 849799, "TB"))).toEqual({ page: "statistics", tab: "simulator", pk: 849799, team: "TB" });
  });
});

describe("team colours", () => {
  it("covers all 30 clubs with valid colours and a visible trim", () => {
    expect(Object.keys(TEAM_KITS)).toHaveLength(30);
    for (const [club, kit] of Object.entries(TEAM_KITS)) {
      expect(kit.shirt, club).toMatch(/^#[0-9a-f]{6}$/);
      expect(kit.accent, club).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(kit.shirt, kit.accent), club).toBeGreaterThanOrEqual(3);
    }
  });
  it("falls back for an unknown club", () => {
    expect(kitFor("XXX")).toEqual(DEFAULT_KIT);
    expect(kitFor("MIL").shirt).toBe("#12284b");
    expect(kitFor("TB").shirt).toBe("#8fbce6");
  });
});

describe("batter figures", () => {
  it("a player keeps the same gear between games", () => {
    expect(figureFor(665489)).toEqual(figureFor(665489));
  });

  it("no lineup repeats a pose on consecutive screens, and each uses several", () => {
    for (const g of games) {
      for (const t of Object.values(g.teams)) {
        const ids = t.optimal.order.map((i) => t.hitters[i].id);
        const figs = lineupFigures(ids);
        figs.forEach((f, i) => {
          expect(f.pose).toBeLessThan(POSES.length);
          if (i > 0) expect(f.pose).not.toBe(figs[i - 1].pose);
        });
        expect(new Set(figs.map((f) => f.pose)).size).toBeGreaterThanOrEqual(3);
      }
    }
  });
});

describe("player photos", () => {
  it("every image in public/players has a licence entry", () => {
    const dir = join(process.cwd(), "public", "players");
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf-8")) as {
      players: { id: number; file: string; author: string; source: string; license: string }[];
    };
    const listed = new Set(manifest.players.map((p) => p.file));
    for (const f of readdirSync(dir).filter((x) => x !== "manifest.json")) expect(listed.has(f), f).toBe(true);
    for (const p of manifest.players) {
      expect(p.author && p.source && p.license, String(p.id)).toBeTruthy();
      expect(readdirSync(dir)).toContain(p.file);
    }
  });
});
