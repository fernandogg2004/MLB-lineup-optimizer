/// <reference lib="webworker" />
import { gainsByDraw } from "./derive";

export interface GainRequest {
  id: number;
  kernel: { P: number[]; R: number[] };
  w: number[];
  draws: number[][];
  opt: number[];
  act: number[];
}

self.onmessage = (e: MessageEvent<GainRequest>) => {
  const { id, kernel, w, draws, opt, act } = e.data;
  (self as DedicatedWorkerGlobalScope).postMessage({ id, gains: gainsByDraw(kernel, w, draws, opt, act) });
};
