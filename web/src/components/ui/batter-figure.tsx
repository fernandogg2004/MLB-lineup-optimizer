import { useId, type CSSProperties, type ReactNode } from "react";
import { POSES, type FigureVariant, type P } from "./batter-poses";

/**
 * Original paper-cut batter illustration, built from a jointed skeleton. Deliberately faceless: it
 * represents a hitter, not a likeness of a real player, and its gear is decorative, not a record of
 * what a player wears. `facing` turns him towards the statistics; `shirt` and `accent` are the team
 * colours; `variant` picks the pose, bat and accessories.
 */

const BATS = [
  { base: "#d8ad74", light: "#efcf9e", grip: "#5b3c1e", barrel: null },
  { base: "#e9d6b4", light: "#f8efdd", grip: "#28211a", barrel: null },
  { base: "#2a2a2f", light: "#4c4c55", grip: "#14171c", barrel: null },
  { base: "#d8ad74", light: "#efcf9e", grip: "#5b3c1e", barrel: "#40281a" },
] as const;

const SKIN = "#d2b9a0";
const SKIN_DARK = "#b8a08a";
const PANTS = "#e9ecf1";
const PANTS_DARK = "#c9ced6";
const SHOE = "#14171c";
const GUARD = "#22262c";

const pts = (...p: P[]) => p.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

function normal(a: P, b: P): P {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [-dy / l, dx / l];
}

/** A tapered limb between two joints. */
function limb(a: P, b: P, wa: number, wb: number, fill: string, key: string, opacity?: number): ReactNode {
  const [nx, ny] = normal(a, b);
  return (
    <polygon
      key={key}
      points={pts([a[0] + (nx * wa) / 2, a[1] + (ny * wa) / 2], [b[0] + (nx * wb) / 2, b[1] + (ny * wb) / 2], [b[0] - (nx * wb) / 2, b[1] - (ny * wb) / 2], [a[0] - (nx * wa) / 2, a[1] - (ny * wa) / 2])}
      fill={fill}
      fillOpacity={opacity}
    />
  );
}

/** The shaded half of a limb, which gives the folded-paper look. */
function shade(a: P, b: P, wa: number, wb: number, key: string, opacity = 0.2): ReactNode {
  const [nx, ny] = normal(a, b);
  return (
    <polygon
      key={key}
      points={pts(a, b, [b[0] + (nx * wb) / 2, b[1] + (ny * wb) / 2], [a[0] + (nx * wa) / 2, a[1] + (ny * wa) / 2])}
      fill="#000"
      fillOpacity={opacity}
    />
  );
}

/** A band across a limb between two positions along it, such as a sock stripe or wristband. */
function band(a: P, b: P, wa: number, wb: number, from: number, to: number, fill: string, key: string): ReactNode {
  const width = (t: number) => wa + (wb - wa) * t;
  return limb(lerp(a, b, from), lerp(a, b, to), width(from) + 1, width(to) + 1, fill, key);
}

function Foot({ at, dir, lift = 0 }: { at: P; dir: 1 | -1; lift?: number }) {
  const [x, y] = at;
  return (
    <polygon
      transform={lift ? `rotate(${-lift} ${x} ${y})` : undefined}
      points={pts([x - 20 * dir, y - 4], [x + 20 * dir, y - 2], [x + 58 * dir, y + 26], [x + 58 * dir, y + 34], [x - 22 * dir, y + 34])}
      fill={SHOE}
    />
  );
}

export function BatterFigure({
  facing = "right",
  shirt = "#3f7fd1",
  accent = "#ffffff",
  variant = { pose: 0, bat: 0 },
  title,
  className = "",
  style,
}: {
  facing?: "left" | "right";
  shirt?: string;
  accent?: string;
  variant?: FigureVariant;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const vars = { "--bf-team": shirt, "--bf-accent": accent, ...style } as CSSProperties;
  const team = "var(--bf-team)";
  const trim = "var(--bf-accent)";
  const p = POSES[variant.pose % POSES.length];
  const bat = BATS[variant.bat % BATS.length];

  const neck: P = [(p.shoulderBack[0] + p.shoulderFront[0]) / 2, (p.shoulderBack[1] + p.shoulderFront[1]) / 2];
  const hipMid: P = [(p.hipBack[0] + p.hipFront[0]) / 2, (p.hipBack[1] + p.hipFront[1]) / 2];
  const headX = neck[0] - 215 + (p.head?.dx ?? 0);
  const headY = neck[1] - 184 + (p.head?.dy ?? 0);
  const headTransform = `translate(${headX} ${headY})${p.head?.tilt ? ` rotate(${p.head.tilt} 215 170)` : ""}`;
  const shin = variant.longPants ? PANTS_DARK : team;
  const shinFront = variant.longPants ? PANTS : team;
  const forearm = variant.longSleeves ? team : SKIN;

  // The drawn bat points 121 degrees from its handle at (140, 176).
  const batTransform = `translate(${p.hands[0] - 136} ${p.hands[1] - 178}) rotate(${121 - p.bat} 136 178)`;

  return (
    <svg
      viewBox="0 -70 460 750"
      preserveAspectRatio="xMidYMin meet"
      className={`bf ${className}`}
      style={vars}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={`${uid}-shadow`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.5" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </linearGradient>
        <filter id={`${uid}-paper`} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="-3" dy="5" stdDeviation="3.5" floodColor="#000" floodOpacity="0.45" />
        </filter>
      </defs>

      <g transform={facing === "left" ? "matrix(-1 0 0 1 460 0)" : undefined}>
        <ellipse cx="225" cy="648" rx="185" ry="17" fill={`url(#${uid}-shadow)`} />

        <g filter={`url(#${uid}-paper)`}>
          {/* Back leg */}
          {limb(p.hipBack, p.kneeBack, 56, 42, PANTS_DARK, "tb")}
          <circle cx={p.kneeBack[0]} cy={p.kneeBack[1]} r={21} fill={PANTS_DARK} />
          {limb(p.kneeBack, p.ankleBack, 40, 30, shin, "sb")}
          {shade(p.kneeBack, p.ankleBack, 40, 30, "ssb", 0.24)}
          {!variant.longPants && band(p.kneeBack, p.ankleBack, 40, 30, 0.2, 0.3, trim, "bb")}
          <Foot at={p.ankleBack} dir={-1} />

          {/* Front leg */}
          {limb(p.hipFront, p.kneeFront, 58, 44, PANTS, "tf")}
          {shade(p.hipFront, p.kneeFront, 58, 44, "stf", 0.13)}
          <circle cx={p.kneeFront[0]} cy={p.kneeFront[1]} r={22} fill={PANTS} />
          {limb(p.kneeFront, p.ankleFront, 42, 30, shinFront, "sf")}
          {shade(p.kneeFront, p.ankleFront, 42, 30, "ssf", 0.2)}
          {!variant.longPants && band(p.kneeFront, p.ankleFront, 42, 30, 0.2, 0.3, trim, "bf")}
          {variant.shinGuard && limb(lerp(p.kneeFront, p.ankleFront, 0.34), lerp(p.kneeFront, p.ankleFront, 0.92), 26, 20, GUARD, "guard-s")}
          <Foot at={p.ankleFront} dir={1} lift={p.frontFootLift} />

          {/* Hips and belt */}
          <polygon points={pts([p.hipBack[0] - 18, p.hipBack[1] + 30], [p.hipFront[0] + 14, p.hipFront[1] + 28], [p.hipFront[0] + 4, p.hipFront[1] - 10], [p.hipBack[0] - 6, p.hipBack[1] - 10])} fill="#dfe3e9" />
          <polygon points={pts([p.hipBack[0] - 6, p.hipBack[1] - 10], [p.hipFront[0] + 4, p.hipFront[1] - 10], [p.hipFront[0] + 2, p.hipFront[1] - 24], [p.hipBack[0] - 3, p.hipBack[1] - 24])} fill={trim} />

          {/* Neck: beneath the shirt and both arms */}
          <polygon transform={headTransform} points="190,152 240,150 244,186 190,190" fill={SKIN_DARK} />

          {/* Torso */}
          <polygon points={pts([p.shoulderBack[0] - 10, p.shoulderBack[1]], [p.shoulderFront[0] + 6, p.shoulderFront[1] - 4], [p.hipFront[0] + 2, p.hipFront[1] - 22], [p.hipBack[0] - 3, p.hipBack[1] - 22])} fill={team} />
          <polygon points={pts([p.shoulderBack[0] - 10, p.shoulderBack[1]], [neck[0] - 18, neck[1] - 2], [hipMid[0] - 12, hipMid[1] - 22], [p.hipBack[0] - 3, p.hipBack[1] - 22])} fill="#000" fillOpacity="0.2" />
          <polygon points={pts([p.shoulderFront[0] - 32, p.shoulderFront[1] - 3], [p.shoulderFront[0] + 6, p.shoulderFront[1] - 4], [p.hipFront[0] + 2, p.hipFront[1] - 22], [p.hipFront[0] - 20, p.hipFront[1] - 21])} fill="#fff" fillOpacity="0.11" />
          {limb([neck[0] + 4, neck[1]], [hipMid[0] + 6, hipMid[1] - 22], 10, 10, trim, "placket")}

          {/* Chain: on the chest, so both arms pass in front of it */}
          {variant.chain && (
            <g className="bf-chain" transform={headTransform}>
              <polyline points="188,176 200,204 217,216 234,204 246,172" fill="none" stroke={variant.chain === "gold" ? "#e6c253" : "#d9dfe6"} strokeWidth="3.5" strokeLinejoin="round" />
              <circle cx="217" cy="221" r="6.5" fill={variant.chain === "gold" ? "#e6c253" : "#d9dfe6"} />
            </g>
          )}

          {/* Back arm, behind the bat */}
          {limb(p.shoulderBack, p.elbowBack, 38, 32, team, "ub")}
          {shade(p.shoulderBack, p.elbowBack, 38, 32, "sub")}
          <circle cx={p.elbowBack[0]} cy={p.elbowBack[1]} r={15} fill={team} />
          {limb(p.elbowBack, p.hands, 30, 22, forearm, "fb")}
          {band(p.elbowBack, p.hands, 30, 22, 0.02, 0.16, trim, "cb")}
        </g>

        {/* Bat */}
        <g className="bf-bat" filter={`url(#${uid}-paper)`} transform={batTransform}>
          <path d="M144.3 173.4 L100.6 97.1 C90 72 80 50 67 26 Q55 2 38 6 Q28 14 43 40.4 C60 65 76 85 89.4 103.7 L135.7 178.6 Z" fill={bat.base} />
          <path d="M144.3 173.4 L100.6 97.1 C90 72 80 50 67 26 Q55 2 38 6 C50 16 66 46 78 72 C92 100 120 140 140 176 Z" fill={bat.light} />
          {bat.barrel && <path d="M95 88 C86 68 76 44 67 26 Q55 2 38 6 Q28 14 43 40.4 C54 56 68 76 83 95 Z" fill={bat.barrel} />}
          <polygon points="147,178 136,184 124,163 134,157" fill={bat.grip} />
          <ellipse cx="149" cy="190" rx="9" ry="6" transform="rotate(-32 149 190)" fill={bat.grip} />
        </g>

        <g className="bf-front" filter={`url(#${uid}-paper)`}>
          {/* Front arm, across the chest to the hands */}
          {limb(p.shoulderFront, p.elbowFront, 40, 34, team, "uf")}
          {shade(p.shoulderFront, p.elbowFront, 40, 34, "suf", 0.18)}
          <circle cx={p.elbowFront[0]} cy={p.elbowFront[1]} r={16} fill={team} />
          {limb(p.elbowFront, p.hands, 32, 24, forearm, "ff")}
          {shade(p.elbowFront, p.hands, 32, 24, "sff", 0.14)}
          {band(p.elbowFront, p.hands, 32, 24, 0.02, 0.16, trim, "cf")}
          {variant.wristband && band(p.elbowFront, p.hands, 32, 24, 0.68, 0.82, trim, "wrist")}
          {variant.elbowGuard && limb(lerp(p.elbowFront, p.hands, -0.14), lerp(p.elbowFront, p.hands, 0.26), 30, 28, GUARD, "guard-e")}

          {/* Hands (gloves) */}
          <polygon points={pts([p.hands[0] - 18, p.hands[1] - 20], [p.hands[0] + 16, p.hands[1] - 12], [p.hands[0] + 18, p.hands[1] + 20], [p.hands[0] - 14, p.hands[1] + 20])} fill={SHOE} />
          <polyline points={pts([p.hands[0] - 16, p.hands[1]], [p.hands[0] + 17, p.hands[1] + 4])} fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.5" />

          {/* Head and helmet: no facial features */}
          <g transform={headTransform}>
            <polygon points="178,96 262,92 266,150 238,170 196,168 176,134" fill={SKIN} />
            <polygon points="178,96 214,94 214,168 196,168 176,134" fill="#000" fillOpacity="0.12" />
            <path d="M166 104 C 164 54, 212 34, 244 44 C 272 52, 282 76, 280 98 L 166 110 Z" fill={team} />
            <path d="M166 104 C 164 54, 212 34, 222 38 C 206 56, 202 84, 204 106 Z" fill="#000" fillOpacity="0.24" />
            <path d="M214 52 C 240 44, 262 60, 268 82 C 248 64, 230 56, 214 52 Z" fill="#fff" fillOpacity="0.2" />
            <path d="M214 40 C222 38 231 39 238 42 C232 62 230 84 231 104 L218 105 C217 82 217 60 214 40 Z" fill={trim} />
            <polygon points="268,90 326,104 324,114 262,110" fill={team} />
            <polygon points="268,90 326,104 324,114 262,110" fill="#000" fillOpacity="0.25" />
            <polygon points="166,104 206,106 206,146 176,140" fill={team} />
            <polygon points="166,104 206,106 206,146 176,140" fill="#000" fillOpacity="0.3" />
            <circle cx="188" cy="124" r="11" fill="#000" fillOpacity="0.32" />
          </g>
        </g>
      </g>
    </svg>
  );
}

export default BatterFigure;
