import { describe, expect, it } from "vitest";
import { allowedMatrix, locksConsistent } from "./constraints";

describe("simulator constraints", () => {
  it("detects a hitter locked to two slots", () => {
    expect(locksConsistent({ 0: 3, 4: 3 })).toBe(false);
    expect(locksConsistent({ 0: 3, 4: 5 })).toBe(true);
  });
  it("builds the allowed matrix for locks", () => {
    const a = allowedMatrix({ 2: 7 });
    expect(a[2].filter(Boolean)).toHaveLength(1);
    expect(a[2][7]).toBe(true);
    for (let s = 0; s < 9; s++) if (s !== 2) expect(a[s][7]).toBe(false);
    expect(a[0][0]).toBe(true);
  });
});
