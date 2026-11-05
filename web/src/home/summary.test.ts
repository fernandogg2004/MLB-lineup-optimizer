import { describe, expect, it } from "vitest";
import type { HomeTeam } from "../data";
import { beatsOutOf100, runGroups, upgradeSize } from "./summary";

const team = (gain: number, order = [1, 0, 2, 3, 4, 5, 6, 7, 8]) =>
  ({ optimal: { order, er9: 4 + gain }, actual: { er9: 4 } }) as unknown as HomeTeam;

describe("upgrade size", () => {
  it("follows runs over a season", () => {
    expect(upgradeSize(team(0.005))).toBe("tiny"); // 0.8 runs
    expect(upgradeSize(team(0.0097))).toBe("small"); // 1.6
    expect(upgradeSize(team(0.0238))).toBe("modest"); // 3.9
    expect(upgradeSize(team(0.04))).toBe("solid"); // 6.5
    expect(upgradeSize(team(0.07))).toBe("big"); // 11.3
  });
  it("says none when the order is unchanged", () => {
    expect(upgradeSize(team(0.03, [0, 1, 2, 3, 4, 5, 6, 7, 8]))).toBe("none");
  });
});

describe("beats out of 100", () => {
  it("is a whole number and never 100", () => {
    expect(beatsOutOf100(0.9125)).toBe("91");
    expect(beatsOutOf100(0.87)).toBe("87");
    expect(beatsOutOf100(0.995)).toBe("99+");
    expect(beatsOutOf100(1)).toBe("99+");
    expect(beatsOutOf100(0.004)).toBe("<1");
    expect(beatsOutOf100(0)).toBe("0");
  });
});

describe("run groups", () => {
  it("groups five or more and totals exactly 100", () => {
    const d = [0.081, 0.131, 0.155, 0.152, 0.133, 0.106, 0.09, 0.07, 0.05, 0.032];
    const g = runGroups(d);
    expect(g.map((x) => x.label)).toEqual(["0", "1", "2", "3", "4", "5+"]);
    expect(g[5].value).toBeCloseTo(0.348, 6);
    expect(g.reduce((a, x) => a + x.percent, 0)).toBe(100);
    expect(g.every((x) => Number.isInteger(x.percent))).toBe(true);
  });
});
