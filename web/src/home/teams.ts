/**
 * Team colours for the illustrated batter: shirt and trim.
 *
 * Source: the published listing at teamcolorcodes.com/mlb-color-codes (checked 2026-11-04), keyed by
 * the MLB Stats API abbreviation. It is a third-party listing, not the clubs' brand guides. Where the
 * two listed colours are too close to tell apart on a small figure, the trim uses white or silver.
 * Tampa Bay uses its light blue as the shirt, as approved in the design review.
 */
export interface Kit {
  shirt: string;
  accent: string;
}

export const TEAM_KITS: Record<string, Kit> = {
  ATH: { shirt: "#003831", accent: "#efb21e" },
  ATL: { shirt: "#ce1141", accent: "#ffffff" },
  AZ: { shirt: "#a71930", accent: "#e3d4ad" },
  BAL: { shirt: "#df4601", accent: "#000000" },
  BOS: { shirt: "#bd3039", accent: "#ffffff" },
  CHC: { shirt: "#0e3386", accent: "#ffffff" },
  CIN: { shirt: "#c6011f", accent: "#000000" },
  CLE: { shirt: "#00385d", accent: "#ffffff" },
  COL: { shirt: "#333366", accent: "#c4ced4" },
  CWS: { shirt: "#27251f", accent: "#c4ced4" },
  DET: { shirt: "#0c2340", accent: "#fa4616" },
  HOU: { shirt: "#002d62", accent: "#eb6e1f" },
  KC: { shirt: "#004687", accent: "#bd9b60" },
  LAA: { shirt: "#003263", accent: "#ffffff" },
  LAD: { shirt: "#005a9c", accent: "#ffffff" },
  MIA: { shirt: "#00a3e0", accent: "#000000" },
  MIL: { shirt: "#12284b", accent: "#ffc52f" },
  MIN: { shirt: "#002b5c", accent: "#ffffff" },
  NYM: { shirt: "#002d72", accent: "#ff5910" },
  NYY: { shirt: "#003087", accent: "#ffffff" },
  PHI: { shirt: "#e81828", accent: "#ffffff" },
  PIT: { shirt: "#27251f", accent: "#fdb827" },
  SD: { shirt: "#2f241d", accent: "#ffc425" },
  SEA: { shirt: "#0c2c56", accent: "#c4ced4" },
  SF: { shirt: "#fd5a1e", accent: "#27251f" },
  STL: { shirt: "#c41e3a", accent: "#ffffff" },
  TB: { shirt: "#8fbce6", accent: "#092c5c" },
  TEX: { shirt: "#003278", accent: "#ffffff" },
  TOR: { shirt: "#134a8e", accent: "#ffffff" },
  WSH: { shirt: "#ab0003", accent: "#ffffff" },
};

/** A neutral kit, so an unknown or renamed club never breaks the page. */
export const DEFAULT_KIT: Kit = { shirt: "#4f6d8f", accent: "#ffffff" };

export function kitFor(team: string): Kit {
  return TEAM_KITS[team] ?? DEFAULT_KIT;
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
