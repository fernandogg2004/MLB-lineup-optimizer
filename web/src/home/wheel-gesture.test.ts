import { describe, expect, it } from "vitest";
import { createWheelGesture, GESTURE_GAP_MS } from "./wheel-gesture";

type Ev = [at: number, deltaY: number];

/** Times at which the detector reports a new scroll. */
function scrolls(stream: Ev[]): number[] {
  const feed = createWheelGesture();
  return stream.filter(([at, dy]) => feed(dy, at)).map(([at]) => at);
}

function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let x = Math.imul(s ^ (s >>> 15), 1 | s);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

/** A flick: quick rise, then coasting that decays until it dies out. */
function flick(start: number, peak: number, decay: number, step: number, sign = 1): Ev[] {
  const out: Ev[] = [];
  let at = start;
  for (const share of [0.35, 0.75]) {
    out.push([at, sign * Math.round(peak * share)]);
    at += step;
  }
  for (let size = peak; size >= 1; size *= decay) {
    out.push([at, sign * Math.round(size)]);
    at += step;
  }
  return out;
}

/** Everything the second flick interrupts; the merged stream keeps time order. */
function interrupted(first: Ev[], second: Ev[]): Ev[] {
  return [...first.filter(([at]) => at < second[0][0]), ...second];
}

/** A browser merging events during slow frames: bigger events, further apart, stamped with the latest time. */
function merged(stream: Ev[], rand: () => number): Ev[] {
  const out: Ev[] = [];
  for (const [at, dy] of stream) {
    const previous = out[out.length - 1];
    if (previous && rand() < 0.3) {
      previous[0] = at;
      previous[1] += dy;
    } else out.push([at, dy]);
  }
  return out;
}

const COASTS = [
  { peak: 40, decay: 0.95, step: 16 },
  { peak: 160, decay: 0.95, step: 16 },
  { peak: 400, decay: 0.97, step: 16 },
  { peak: 120, decay: 0.96, step: 8 },
  { peak: 80, decay: 0.98, step: 16 },
  // A busy page: the browser merges events down to about one every 45 ms.
  { peak: 300, decay: 0.87, step: 45 },
  { peak: 120, decay: 0.9, step: 30 },
];

describe("one scroll stays one scroll", () => {
  it("a flick and its whole coast", () => {
    for (const c of COASTS) {
      expect(scrolls(flick(1000, c.peak, c.decay, c.step))).toEqual([1000]);
    }
  });

  it("a coast with noisy sizes and timing, merged or not", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const rand = random(seed);
      for (const c of COASTS) {
        let at = 1000;
        const noisy: Ev[] = flick(1000, c.peak, c.decay, c.step).map(([, dy]) => {
          const event: Ev = [at, Math.max(1, Math.round(dy * (0.75 + rand() * 0.5)))];
          at += c.step * (0.6 + rand() * 0.8);
          return event;
        });
        expect(scrolls(noisy)).toEqual([1000]);
        // Merging slow delivery further would open gaps over the pause limit, which are real pauses.
        if (c.step <= 16) expect(scrolls(merged(noisy, rand))).toHaveLength(1);
      }
    }
  });

  it("a long drag whose speed keeps wandering", () => {
    // Under heavy merging this model gives about 1 false scroll in 1,500 three-second drags (measured
    // over 6,000); stricter settings barely lower that and miss far more real flicks.
    let falseWhenMerged = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const rand = random(seed);
      const stream: Ev[] = [];
      let at = 1000;
      let speed = 10 + rand() * 60;
      while (at < 4000) {
        speed = Math.min(150, Math.max(6, speed * (0.82 + rand() * 0.36)));
        stream.push([at, Math.max(1, Math.round(speed * (0.8 + rand() * 0.4)))]);
        at += 8 + rand() * 16;
      }
      expect(scrolls(stream)).toEqual([1000]);
      if (scrolls(merged(stream, rand)).length !== 1) falseWhenMerged += 1;
    }
    expect(falseWhenMerged).toBeLessThanOrEqual(1);
  });

  it("a drag that starts slowly and then speeds up", () => {
    const stream: Ev[] = [];
    for (let i = 0; i < 100; i++) stream.push([1000 + i * 16, Math.round(2 + (i / 12) ** 2)]);
    expect(scrolls(stream)).toEqual([1000]);
  });

  it("a speed that swings smoothly, with single large events", () => {
    const stream: Ev[] = [];
    for (let i = 0; i < 120; i++) stream.push([1000 + i * 25, Math.round(70 + 60 * Math.sin(i / 4) + (i % 15 === 0 ? 150 : 0))]);
    expect(scrolls(stream)).toEqual([1000]);
  });

  it("a mouse wheel spun quickly, then less quickly", () => {
    const stream: Ev[] = [];
    let at = 1000;
    for (let i = 0; i < 60; i++) {
      stream.push([at, 100]);
      at += 30 + 60 * Math.abs(Math.sin(i / 5));
    }
    expect(scrolls(stream)).toEqual([1000]);
  });

  it("one stray event against the direction of travel", () => {
    const stream = flick(1000, 120, 0.95, 16);
    stream.splice(20, 1, [stream[20][0], -6]);
    expect(scrolls(stream)).toEqual([1000]);
  });
});

describe("a new flick counts without waiting for the coast to end", () => {
  it("during a coast of any kind, once the coast has faded", () => {
    for (const c of COASTS) {
      const first = flick(1000, c.peak, c.decay, c.step);
      // Flick when the coast is down to a tenth of its peak and the 850 ms move has landed.
      const faded = Math.max(first.find(([, dy]) => dy <= c.peak * 0.1)![0], 1850);
      const second = flick(faded + c.step, c.peak, c.decay, c.step);
      const found = scrolls(interrupted(first, second));
      expect(found).toHaveLength(2);
      // Slow delivery takes longer to confirm, but never long.
      expect(found[1] - second[0][0]).toBeLessThanOrEqual(Math.max(100, c.step * 5));
    }
  });

  it("while the coast is noisy", () => {
    let caught = 0;
    const runs = 200;
    for (let seed = 1; seed <= runs; seed++) {
      const rand = random(seed);
      const first = flick(1000, 160, 0.95, 16);
      const second = flick(1900, 160, 0.95, 16);
      const noisy = interrupted(first, second).map(([at, dy]): Ev => [at, Math.max(1, Math.round(dy * (0.8 + rand() * 0.4)))]);
      const found = scrolls(noisy);
      expect(found.length).toBeLessThanOrEqual(2);
      if (found.length === 2) caught += 1;
    }
    expect(caught / runs).toBeGreaterThanOrEqual(0.95);
  });

  it("a slow stream, about one event every 45 ms", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const rand = random(seed);
      const stream: Ev[] = [];
      let at = 1000;
      let speed = 10 + rand() * 60;
      while (at < 4000) {
        const gap = 30 + rand() * 30;
        speed = Math.min(150, Math.max(6, speed * (0.82 + rand() * 0.36)));
        stream.push([at, Math.max(1, Math.round((speed * gap) / 16))]);
        at += gap;
      }
      expect(scrolls(stream)).toHaveLength(1);
    }
    const stream = interrupted(flick(1000, 300, 0.87, 45), flick(1900, 300, 0.87, 45));
    expect(scrolls(stream)).toHaveLength(2);
  });

  it("a flick stronger than the first", () => {
    const found = scrolls(interrupted(flick(1000, 100, 0.95, 16), flick(1900, 300, 0.95, 16)));
    expect(found).toHaveLength(2);
  });

  it("a third flick counts as well", () => {
    const stream = interrupted(interrupted(flick(1000, 160, 0.95, 16), flick(1900, 160, 0.95, 16)), flick(2800, 160, 0.95, 16));
    expect(scrolls(stream)).toHaveLength(3);
  });

  it("a flick in the opposite direction counts at once, even at full speed", () => {
    const first = flick(1000, 160, 0.95, 16);
    const back = flick(1200, 160, 0.95, 16, -1);
    const found = scrolls(interrupted(first, back));
    expect(found).toHaveLength(2);
    expect(found[1] - 1200).toBeLessThanOrEqual(16);
  });

  it("a pause always counts", () => {
    const end = 1000 + 4 * 16;
    const stream: Ev[] = [[1000, 100], [1016, 100], [1032, 100], [1048, 100], [end, 100], [end + GESTURE_GAP_MS + 1, 100]];
    expect(scrolls(stream)).toEqual([1000, end + GESTURE_GAP_MS + 1]);
  });
});

describe("what still waits", () => {
  it("a flick while the first coast is still strong stays part of it", () => {
    // Too close to a change of speed in a long scroll to tell apart, so a skip is never risked.
    const first = flick(1000, 160, 0.95, 16);
    expect(scrolls(interrupted(first, flick(1100, 200, 0.95, 16)))).toEqual([1000]);
  });
});
