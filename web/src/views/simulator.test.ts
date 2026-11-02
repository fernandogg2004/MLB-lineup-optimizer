import { describe, expect, it } from "vitest";
import { allowedMatrix, nextFreeSlot } from "./constraints";

describe("simulator constraints", () => {
  it("builds the allowed matrix for locks", () => {
    const a = allowedMatrix({ 2: 7 });
    expect(a[2].filter(Boolean)).toHaveLength(1);
    expect(a[2][7]).toBe(true);
    for (let s = 0; s < 9; s++) if (s !== 2) expect(a[s][7]).toBe(false);
    expect(a[0][0]).toBe(true);
  });

  it("skips locked slots when moving", () => {
    const locked = new Set([2]);
    expect(nextFreeSlot(3, -1, locked)).toBe(1);
    expect(nextFreeSlot(1, 1, locked)).toBe(3);
    expect(nextFreeSlot(0, -1, locked)).toBeNull();
    expect(nextFreeSlot(2, -1, new Set([0, 1]))).toBeNull();
    expect(nextFreeSlot(8, 1, locked)).toBeNull();
  });
});
