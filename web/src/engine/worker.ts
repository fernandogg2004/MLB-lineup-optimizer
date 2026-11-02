/// <reference lib="webworker" />
import { exhaustiveSearch, operators } from "./markov";
import type { KernelData, MatchupData } from "./markov";

export interface SearchRequest {
  id: number;
  kernel: KernelData;
  matchup: MatchupData;
  allowed: boolean[][] | null;
  histRange: [number, number];
}

export type SearchMessage =
  | { id: number; type: "progress"; fraction: number }
  | { id: number; type: "done"; best: number[]; bestValue: number; feasible: number }
  | { id: number; type: "error"; message: string };

self.onmessage = (e: MessageEvent<SearchRequest>) => {
  const { id, kernel, matchup, allowed, histRange } = e.data;
  try {
    const op = operators(kernel, matchup);
    const res = exhaustiveSearch(op, allowed, histRange, 60, (f) =>
      (self as DedicatedWorkerGlobalScope).postMessage({ id, type: "progress", fraction: f } satisfies SearchMessage),
    );
    (self as DedicatedWorkerGlobalScope).postMessage({
      id,
      type: "done",
      best: res.best,
      bestValue: res.bestValue,
      feasible: res.feasible,
    } satisfies SearchMessage);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id, type: "error", message: String(err) } satisfies SearchMessage);
  }
};
