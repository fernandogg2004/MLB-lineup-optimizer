import { describe, expect, it } from "vitest";
import { logoUrl, TEAM_KITS } from "./teams";

describe("team logos", () => {
  it("has a distinct MLB address for all 30 clubs", () => {
    const urls = Object.keys(TEAM_KITS).map(logoUrl);
    expect(urls).toHaveLength(30);
    expect(urls.every((u) => u?.startsWith("https://www.mlbstatic.com/team-logos/team-cap-on-dark/"))).toBe(true);
    expect(new Set(urls).size).toBe(30);
  });

  it("has none for an unknown club, so the badge shows instead", () => {
    expect(logoUrl("XXX")).toBeNull();
  });
});
