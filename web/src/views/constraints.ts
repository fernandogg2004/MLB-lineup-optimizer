/** Feasibility of lock constraints: each slot <= 1 locked hitter and vice versa. */
export function locksConsistent(locks: Record<number, number>): boolean {
  const players = Object.values(locks);
  return new Set(players).size === players.length;
}

export function allowedMatrix(locks: Record<number, number>): boolean[][] {
  const allowed = Array.from({ length: 9 }, () => Array(9).fill(true));
  for (const [slotS, player] of Object.entries(locks)) {
    const slot = Number(slotS);
    for (let p = 0; p < 9; p++) allowed[slot][p] = p === player;
    for (let s = 0; s < 9; s++) if (s !== slot) allowed[s][player] = false;
  }
  return allowed;
}
