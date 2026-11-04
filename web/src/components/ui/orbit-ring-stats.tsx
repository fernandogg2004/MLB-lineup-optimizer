import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import "./orbit-ring-stats-utils/orbit-ring-stats.css";

/**
 * Orbit Ring Stats, adapted for Batting Order Lab.
 *
 * Differences from the supplied component:
 * - `display` sets the text in the centre independently of `value`, so a ring can show ".275"
 *   while its arc shows the 91st percentile.
 * - `active` lets the parent start and replay the reveal. Pinned, stacked screens all count as
 *   "intersecting", so an IntersectionObserver alone would fire every ring at once. When `active`
 *   is omitted the component falls back to the original observer behaviour.
 * - The orbit loop only runs while active, and a new `rings` array no longer resets the angles.
 */

export type Orbit = {
  label: string;
  /** Drives the arc: the arc covers value / max of the circle. */
  value: number;
  max?: number;
  /** Text in the centre. Defaults to `value` plus `unit`. */
  display?: string;
  unit?: string;
  /** Short line under the ring, e.g. "91st percentile". */
  note?: string;
  /** Words that orbit the ring. Defaults to the label. */
  orbit?: string;
  /** Screen-reader text. Defaults to the display text. */
  valueText?: string;
  /** Plain explanation shown on hover, keyboard focus or tap. */
  hint?: string;
};

type Props = {
  rings: Orbit[];
  label?: string;
  theme?: "paper" | "night";
  motion?: "full" | "reduced";
  /** Parent-controlled reveal. Omit to start when scrolled into view. */
  active?: boolean;
  className?: string;
};

const R = 93; // orbit radius in the 200-unit viewBox
const LAP = 2 * Math.PI * R;
const FAST = 7; // deg/s at rest
const SLOW = 0.8; // deg/s while hovered

function Reels({ text, on }: { text: string; on: boolean }) {
  const chars = text.split("");
  return (
    <>
      {chars.map((c, i) => {
        const key = chars.length - i;
        return /\d/.test(c) ? (
          <span
            key={key}
            className="ors__reel"
            style={{ "--d": on ? Number(c) : 0, "--k": key } as CSSProperties}
          >
            <span className="ors__strip">
              {Array.from({ length: 10 }, (_, k) => (
                <span key={k}>{k}</span>
              ))}
            </span>
          </span>
        ) : (
          <span key={`s${key}`}>{c}</span>
        );
      })}
    </>
  );
}

export function OrbitRingStats({
  rings,
  label = "Key figures",
  theme = "night",
  motion = "full",
  active,
  className = "",
}: Props) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const root = useRef<HTMLElement>(null);
  const spins = useRef<(SVGSVGElement | null)[]>([]);
  const angles = useRef<number[]>([]);
  const hot = useRef<number>(-1);
  const raf = useRef(0);
  const [seen, setSeen] = useState(false);
  const [hintOff, setHintOff] = useState(-1);
  const controlled = active !== undefined;
  const on = controlled ? active : seen;
  const count = rings.length;

  // Uncontrolled: start once, when a third of the row is visible.
  useEffect(() => {
    if (controlled) return;
    const el = root.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [controlled]);

  // The orbiting words: one loop for all rings, each easing toward its own speed. Paused offscreen.
  useEffect(() => {
    const reduce =
      motion === "reduced" ||
      matchMedia("(prefers-reduced-motion: reduce)").matches;
    const el = root.current;
    if (reduce || !el || (controlled && !on)) return;
    while (angles.current.length < count) angles.current.push(angles.current.length * 47);
    const ang = angles.current;
    const vel = Array.from({ length: count }, () => FAST);
    let last = 0;
    const tick = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0;
      last = t;
      for (let i = 0; i < count; i++) {
        const want = hot.current === i ? SLOW : FAST;
        vel[i] += (want - vel[i]) * Math.min(1, dt * 4);
        ang[i] = (ang[i] + vel[i] * dt) % 360;
        // The whole layer turns, so the text is painted once rather than every frame.
        const orbit = spins.current[i];
        if (orbit) orbit.style.transform = `rotate(${ang[i].toFixed(2)}deg)`;
      }
      raf.current = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !raf.current) {
        last = 0;
        raf.current = requestAnimationFrame(tick);
      }
      if (!e.isIntersecting && raf.current) {
        cancelAnimationFrame(raf.current);
        raf.current = 0;
      }
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, [count, motion, controlled, on]);

  return (
    <section
      ref={root}
      className={`ors ors--${theme} ${className}`}
      data-motion={motion}
      data-on={on || undefined}
      aria-label={label}
    >
      <ul className="ors__row">
        {rings.map((g, i) => {
          const max = g.max ?? 100;
          const p = Math.max(0, Math.min(1, g.value / max));
          const words = (g.orbit ?? g.label).toUpperCase();
          // Repeat the words until they go round once, then spread them to exactly one lap.
          const reps = Math.max(1, Math.round(LAP / ((words.length + 3) * 7.3)));
          const lap = Array.from({ length: reps }, () => `${words} · `).join("");
          const shown = g.display ?? `${g.value}`;
          const centre: ReactNode = (
            <span className="ors__num">
              <Reels text={shown} on={on} />
              {g.unit && <span className="ors__unit">{g.unit}</span>}
            </span>
          );
          return (
            <li
              key={g.label}
              className="ors__item"
              data-hint-off={hintOff === i || undefined}
              onPointerEnter={() => (hot.current = i)}
              onPointerLeave={() => {
                hot.current = -1;
                setHintOff(-1);
              }}
              onBlur={() => setHintOff(-1)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setHintOff(i);
              }}
            >
              <p className="ors__label">{g.label}</p>
              <div
                className="ors__dial"
                role="meter"
                aria-label={g.label}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={g.value}
                aria-valuetext={g.valueText ?? `${shown}${g.unit ?? ""}`}
                tabIndex={g.hint ? 0 : undefined}
                style={{ "--ors-v": on ? p : 0, "--i": i } as CSSProperties}
              >
                <svg
                  className="ors__orbit"
                  viewBox="0 0 200 200"
                  aria-hidden="true"
                  ref={(el) => void (spins.current[i] = el)}
                  style={{ transform: `rotate(${i * 47}deg)` }}
                >
                  <defs>
                    <path
                      id={`${uid}-o${i}`}
                      d={`M100 ${100 - R} a${R} ${R} 0 1 1 0 ${2 * R} a${R} ${R} 0 1 1 0 ${-2 * R}`}
                    />
                  </defs>
                  <text>
                    <textPath href={`#${uid}-o${i}`} textLength={LAP - 1} lengthAdjust="spacing">
                      {lap}
                    </textPath>
                  </text>
                </svg>
                <span className="ors__track" aria-hidden="true" />
                <span className="ors__arc" aria-hidden="true" />
                <span className="ors__head" aria-hidden="true" />
                <span className="ors__face" aria-hidden="true">
                  {centre}
                </span>
                <span className="ors__face ors__flood" aria-hidden="true">
                  {centre}
                </span>
              </div>
              {g.note && <p className="ors__note">{g.note}</p>}
              {g.hint && (
                <p className="ors__hint" aria-hidden="true">
                  {g.hint}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default OrbitRingStats;
