/**
 * Decides when wheel input begins a new scroll, so that one scroll moves one screen.
 *
 * A trackpad keeps sending events while it coasts after a flick, so a second flick can arrive with no
 * pause at all. Being wrong in one direction skips a batter and in the other only asks for one more
 * flick, so anything ambiguous stays part of the current scroll. A new scroll is one of:
 *
 * - a pause in the input;
 * - a sharp jump after the stream has clearly faded, which is what a flick during a coast looks like;
 * - a reversal, because coasting never changes direction.
 *
 * Changes in speed alone are not enough: a long scroll speeds up and slows down all the time.
 *
 * Everything is measured in time, not in events, because a busy page delivers fewer, larger events.
 * The thresholds were tuned on simulated and recorded browser streams; real trackpads are still to be confirmed.
 */

/** No input for this long ends a scroll. */
export const GESTURE_GAP_MS = 200;

/** Reversal: events this large, this many in a row. A single one can be the hand shifting. */
const REVERSAL_MIN_SIZE = 4;
const REVERSAL_EVENTS = 2;

/** Speeds are in pixels per this long, whatever the delivery rate. */
const FRAME_MS = 16;
/** Average speed is measured over this long, which merged events cannot fool. */
const SPEED_WINDOW_MS = 64;
/** Event speed is the median of this many events, so a single large event means nothing. */
const SPEED_EVENTS = 3;
/** Two events can share a time, or nearly; this keeps their speed finite. */
const MIN_EVENT_GAP_MS = 4;

/** The stream must have peaked at least this high. */
const MIN_PEAK = 12;
/**
 * And it must have stayed below this share of the peak for this long. This is the rule that separates the two
 * cases: a long scroll's speed swings back within a few hundred ms, while a coast stays low for far longer. It
 * costs little, because a move takes 850 ms and a new flick only has an effect once the move lands. The share
 * is well under the jump's own bar, so one large early spike cannot make everything after it look quiet.
 */
const QUIET_SHARE_OF_PEAK = 0.4;
const QUIET_MS = 500;
/** Strong readings this recent may be the flick's own rise, so they do not end the quiet until they age. */
const RISE_MS = 120;
/** Before the jump the stream must have fallen to this share of its peak. */
const FADED_SHARE = 0.5;
/** The jump is measured from the level this long ago: a flick is quick, a change of pace is not. */
const BEFORE_FROM_MS = 100;
const BEFORE_TO_MS = 40;
/** It must be this many times larger, back to this share of the peak, and not tiny... */
const JUMP_RATIO = 3.5;
const JUMP_SHARE_OF_PEAK = 0.7;
const JUMP_MIN_LEVEL = 6;
/** ...and hold for this long, over at least two events. */
const JUMP_HOLD_MS = 16;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** The lower of the two middle values, because a level already rising must not raise the baseline. */
function lowerMedian(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) / 2)];
}

export function createWheelGesture() {
  let last = -Infinity;
  let direction = 0;
  let against = 0;
  let peak = 0;
  let strongAt = 0;
  let rising: number[] = [];
  let speeds: number[] = [];
  let events: { at: number; size: number }[] = [];
  let levels: { at: number; level: number }[] = [];
  // Set while a jump is holding: the level it started from, when, and over how many events.
  let jump: { from: number; at: number; events: number } | null = null;

  const startOver = (at: number) => {
    speeds = [];
    events = [];
    levels = [];
    peak = 0;
    strongAt = at;
    rising = [];
    jump = null;
  };

  /** Feed each event's deltaY and timestamp. Returns true if this event begins a new scroll. */
  return (deltaY: number, at: number): boolean => {
    const size = Math.abs(deltaY);
    const gap = at - last;
    const paused = gap > GESTURE_GAP_MS;
    last = at;
    if (paused) {
      direction = 0;
      against = 0;
      startOver(at);
    }
    if (size === 0) return paused;
    const sign = Math.sign(deltaY);
    if (direction === 0) direction = sign;

    if (sign !== direction) {
      if (size >= REVERSAL_MIN_SIZE) against += 1;
      if (against < REVERSAL_EVENTS) return paused;
      direction = sign;
      against = 0;
      startOver(at);
      return true;
    }
    against = 0;

    // Both measures must agree. Merged events look larger but are further apart, and uneven delivery
    // makes single gaps look fast. The oldest event kept only marks where the window starts.
    if (!paused) speeds = [...speeds, (size / Math.max(gap, MIN_EVENT_GAP_MS)) * FRAME_MS].slice(-SPEED_EVENTS);
    events.push({ at, size });
    while (events.length > 1 && at - events[1].at >= SPEED_WINDOW_MS) events.shift();
    const span = at - events[0].at;
    const distance = events.slice(1).reduce((sum, e) => sum + e.size, 0);
    const average = span > 0 ? (distance / span) * FRAME_MS : 0;
    const level = speeds.length ? Math.min(average, median(speeds)) : 0;

    for (const t of rising) if (at - t >= RISE_MS) strongAt = t;
    rising = rising.filter((t) => at - t < RISE_MS);

    levels = levels.filter((l) => at - l.at <= BEFORE_FROM_MS);
    const before = levels.filter((l) => at - l.at >= BEFORE_TO_MS).map((l) => l.level);
    const from = jump ? jump.from : before.length ? lowerMedian(before) : Infinity;
    const jumping =
      peak >= MIN_PEAK &&
      at - strongAt >= QUIET_MS &&
      from <= peak * FADED_SHARE &&
      level >= from * JUMP_RATIO &&
      level >= peak * JUMP_SHARE_OF_PEAK &&
      level >= JUMP_MIN_LEVEL;

    if (jumping) {
      jump = jump ? { ...jump, events: jump.events + 1 } : { from, at, events: 1 };
      if (jump.events >= 2 && at - jump.at >= JUMP_HOLD_MS) {
        peak = level;
        strongAt = at;
        rising = [];
        levels = [];
        jump = null;
        return true;
      }
    } else {
      jump = null;
      if (level > peak) peak = level;
      if (level >= peak * QUIET_SHARE_OF_PEAK) rising.push(at);
    }
    levels.push({ at, level });
    return paused;
  };
}
