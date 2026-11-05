import { useState } from "react";
import { contrast, kitFor, logoUrl } from "../home/teams";

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
