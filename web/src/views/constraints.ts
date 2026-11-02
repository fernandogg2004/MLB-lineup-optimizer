/** `allowed[slot][player]` for locks of the form slot -> player. */
export function allowedMatrix(locks: Record<number, number>): boolean[][] {
  const allowed = Array.from({ length: 9 }, () => Array(9).fill(true));
  for (const [slotS, player] of Object.entries(locks)) {
    const slot = Number(slotS);
    for (let p = 0; p < 9; p++) allowed[slot][p] = p === player;
    for (let s = 0; s < 9; s++) if (s !== slot) allowed[s][player] = false;
  }
  return allowed;
}

/** Nearest unlocked slot from `from` in direction `dir`, skipping locked slots; null if none. */
export function nextFreeSlot(from: number, dir: -1 | 1, locked: Set<number>): number | null {
  for (let s = from + dir; s >= 0 && s < 9; s += dir) if (!locked.has(s)) return s;
  return null;
}
