import { useState } from "react";
import { contrast, kitFor, logoUrl } from "../home/teams";

const SEAM = { from: [30, -2], bend: [4, 29], to: [30, 60] };
const seamAt = (t: number, a: number[], b: number[], c: number[], i: number) => (1 - t) ** 2 * a[i] + 2 * (1 - t) * t * b[i] + t ** 2 * c[i];
const STITCHES = [0.12, 0.31, 0.5, 0.69, 0.88].map((t) => {
  const { from, bend, to } = SEAM;
  const dx = 2 * (1 - t) * (bend[0] - from[0]) + 2 * t * (to[0] - bend[0]);
  const dy = 2 * (1 - t) * (bend[1] - from[1]) + 2 * t * (to[1] - bend[1]);
  return { x: seamAt(t, from, bend, to, 0), y: seamAt(t, from, bend, to, 1), angle: (Math.atan2(dy, dx) * 180) / Math.PI - 90 };
});

/** A baseball's seam after the title: a curved line crossed by red stitches. */
export function SeamMark() {
  return (
    <svg className="seam" viewBox="0 0 36 58" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path className="seam-line" d={`M${SEAM.from} Q${SEAM.bend} ${SEAM.to}`} />
      {STITCHES.map((s) => (
        <path key={s.y} className="seam-stitch" d="M-6 3.5 0-1 6 3.5" transform={`translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) rotate(${s.angle.toFixed(1)})`} />
      ))}
    </svg>
  );
}

/** World Series games get a gold ball, all others a white one. */
export function Baseball({ gold }: { gold: boolean }) {
  return (
    <svg className={`ball ${gold ? "ball-gold" : "ball-white"}`} viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle className="ball-skin" cx="12" cy="12" r="10.5" />
      <path className="ball-seam" d="M6.2 3.4c3 2.3 4.6 5.2 4.6 8.6s-1.6 6.3-4.6 8.6" />
      <path className="ball-seam" d="M17.8 3.4c-3 2.3-4.6 5.2-4.6 8.6s1.6 6.3 4.6 8.6" />
      <path
        className="ball-stitch"
        d="m6.8 6.4 2-1.1M8.6 9l2.2-.7M9.2 12h2.3M8.6 15l2.2.7M6.8 17.6l2 1.1M17.2 6.4l-2-1.1M15.4 9l-2.2-.7M14.8 12h-2.3M15.4 15l-2.2.7M17.2 17.6l-2 1.1"
      />
    </svg>
  );
}

/**
 * The club's logo, loaded from MLB's own address: no logo file is stored in this repository (ADR 0003).
 * If it cannot load, or the club is unknown, a badge in the team's colours takes its place.
 */
export function TeamLogo({ team }: { team: string }) {
  const [failed, setFailed] = useState(false);
  const url = logoUrl(team);
  if (!url || failed) {
    const { shirt } = kitFor(team);
    const color = contrast(shirt, "#ffffff") >= contrast(shirt, "#000000") ? "#ffffff" : "#000000";
    return (
      <span className="team-badge" style={{ background: shirt, color }} aria-hidden="true">
        {team}
      </span>
    );
  }
  return <img className="team-logo" src={url} alt="" width="24" height="24" referrerPolicy="no-referrer" onError={() => setFailed(true)} />;
}
