import type { HomeTeam } from "../data";
import type { Key } from "../strings";
import { biggestMove, chanceOfFivePlus, chanceOfScoring, runsGained, runsOverSeason, sameOrder } from "./derive";

type Vars = Record<string, string>;

interface Line {
  key: Key;
  vars: Vars;
  /** Placeholders shown as plain text rather than rolling numbers. */
  plain?: string[];
}

export function summaryLines(team: HomeTeam, helpers: {
  fmt: (v: number, d?: number) => string;
  signed: (v: number, d?: number) => string;
  whole: (p: number, percent: boolean) => string;
  ord: (n: number) => string;
}): Line[] {
  const { fmt, signed, whole, ord } = helpers;
  const order = team.optimal.order;
  const lines: Line[] = [{ key: "sum.expects", vars: { runs: fmt(team.optimal.er9, 2) } }];
  const move = biggestMove(order);
  if (move) {
    lines.push({
      key: move.to < move.from ? "sum.move_up" : "sum.move_down",
      vars: { name: team.hitters[move.hitter].name, from: ord(move.from + 1), to: ord(move.to + 1) },
      plain: ["name", "from"],
    });
  } else {
    lines.push({ key: "sum.no_move", vars: {} });
  }
  lines.push({
    key: "sum.pa",
    vars: { first: fmt(team.optimal.pa_by_slot[0], 1), ninth: fmt(team.optimal.pa_by_slot[8], 1) },
  });
  if (sameOrder(order)) {
    lines.push({ key: "sum.no_gain", vars: {} });
  } else {
    const gain = runsGained(team);
    const season = Math.round(runsOverSeason(team));
    const gainText = gain < 0.005 ? `<${signed(0.01, 2)}` : signed(gain, 2);
    if (season >= 1) lines.push({ key: "sum.gain", vars: { gain: gainText, season: String(season) } });
    else lines.push({ key: "sum.gain_small", vars: { gain: gainText } });
    lines.push({
      key: team.uncertainty.diff_q05 <= 0 ? "sum.beats_unsure" : "sum.beats",
      vars: { p: whole(team.uncertainty.p_opt_better, false) },
    });
  }
  lines.push({
    key: "sum.score",
    vars: { p: whole(chanceOfScoring(team), true), q: whole(chanceOfFivePlus(team), true) },
  });
  return lines;
}
