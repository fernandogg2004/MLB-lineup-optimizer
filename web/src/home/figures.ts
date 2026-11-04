import { POSES, type FigureVariant } from "../components/ui/batter-poses";

/** A small stable hash, so a player keeps the same gear between games. */
function hash(n: number): number {
  let h = 2166136261;
  for (const c of String(n)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h ^ (h >>> 15)) >>> 0;
}

/** Bits of the hash, as independent yes/no choices at about the given chance out of 16. */
const pick = (h: number, shift: number, of16: number) => ((h >>> shift) & 15) < of16;

export function figureFor(playerId: number): FigureVariant {
  const h = hash(playerId);
  const chain = pick(h, 3, 5);
  return {
    pose: h % POSES.length,
    bat: (h >>> 7) % 4,
    chain: chain ? (pick(h, 9, 8) ? "gold" : "silver") : null,
    elbowGuard: pick(h, 11, 6),
    shinGuard: pick(h, 15, 6),
    wristband: pick(h, 19, 7),
    longPants: pick(h, 23, 4),
    longSleeves: pick(h, 27, 5),
  };
}

/**
 * Figures for a lineup in batting order. Each player has his own look; a pose is changed only when
 * it would repeat the previous batter's, so consecutive screens always differ.
 */
export function lineupFigures(playerIds: number[]): FigureVariant[] {
  const out: FigureVariant[] = [];
  for (const id of playerIds) {
    const f = figureFor(id);
    const previous = out[out.length - 1]?.pose;
    out.push(f.pose === previous ? { ...f, pose: (f.pose + 1) % POSES.length } : f);
  }
  return out;
}
