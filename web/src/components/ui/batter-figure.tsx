import { useId, type CSSProperties } from "react";

/**
 * Original paper-cut batter illustration. Deliberately faceless: it represents a hitter, not a
 * likeness of a real player. `facing` sets the direction the batter looks, so the page can always
 * turn him towards the statistics. `shirt` and `accent` are the team colours.
 */
export function BatterFigure({
  facing = "right",
  shirt = "#3f7fd1",
  accent = "#ffffff",
  title,
  className = "",
  style,
}: {
  facing?: "left" | "right";
  shirt?: string;
  accent?: string;
  title?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const vars = { "--bf-team": shirt, "--bf-accent": accent, ...style } as CSSProperties;
  return (
    <svg
      viewBox="0 0 460 680"
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
        <ellipse cx="232" cy="648" rx="178" ry="17" fill={`url(#${uid}-shadow)`} />

        <g filter={`url(#${uid}-paper)`}>
          {/* Back leg */}
          <polygon points="196,352 150,356 94,470 134,484" fill="#c9ced6" />
          <polygon points="94,470 134,484 124,608 92,604" fill="var(--bf-team)" />
          <polygon points="94,470 110,475 104,606 92,604" fill="#000" fillOpacity="0.24" />
          <polygon points="97,500 129,510 128,526 96,516" fill="var(--bf-accent)" />
          <polygon points="88,602 128,606 136,640 60,640 62,624" fill="#14171c" />

          {/* Front leg */}
          <polygon points="222,352 280,348 342,462 298,482" fill="#e9ecf1" />
          <polygon points="280,348 342,462 322,472 254,350" fill="#c9ced6" />
          <polygon points="298,482 342,462 372,604 336,610" fill="var(--bf-team)" />
          <polygon points="342,462 372,604 354,607 322,472" fill="#000" fillOpacity="0.24" />
          <polygon points="304,508 347,488 351,504 308,524" fill="var(--bf-accent)" />
          <polygon points="334,606 374,602 412,630 412,640 332,640" fill="#14171c" />

          {/* Hips */}
          <polygon points="150,356 280,348 272,312 158,316" fill="#dfe3e9" />
          <polygon points="158,316 272,312 270,298 162,302" fill="var(--bf-accent)" />

          {/* Torso */}
          <polygon points="150,186 276,178 270,300 162,304" fill="var(--bf-team)" />
          <polygon points="150,186 196,183 204,303 162,304" fill="#000" fillOpacity="0.2" />
          <polygon points="238,180 276,178 271,300 248,301" fill="#fff" fillOpacity="0.11" />
          <polygon points="214,182 224,182 226,300 216,301" fill="var(--bf-accent)" />

          {/* Back arm, elbow out and behind the bat */}
          <polygon points="164,170 172,206 100,242 76,212" fill="var(--bf-team)" />
          <polygon points="164,170 172,206 100,242 88,227" fill="#000" fillOpacity="0.2" />
          <polygon points="76,212 100,242 150,198 126,168" fill="#d2b9a0" />
          <polygon points="76,212 100,242 111,232 88,202" fill="var(--bf-accent)" />
          <polygon points="88,227 100,242 150,198 138,183" fill="#000" fillOpacity="0.14" />
        </g>

        {/* Bat: separate layer for parallax */}
        <g className="bf-bat" filter={`url(#${uid}-paper)`}>
          <path d="M144.3 173.4 L100.6 97.1 C90 72 80 50 67 26 Q55 2 38 6 Q28 14 43 40.4 C60 65 76 85 89.4 103.7 L135.7 178.6 Z" fill="#d8ad74" />
          <path d="M144.3 173.4 L100.6 97.1 C90 72 80 50 67 26 Q55 2 38 6 C50 16 66 46 78 72 C92 100 120 140 140 176 Z" fill="#efcf9e" />
          <polygon points="147,178 136,184 124,163 134,157" fill="#5b3c1e" />
          <ellipse cx="149" cy="190" rx="9" ry="6" transform="rotate(-32 149 190)" fill="#5b3c1e" />
        </g>

        <g filter={`url(#${uid}-paper)`}>
          {/* Front arm reaching across the chest to the hands */}
          <polygon points="270,178 284,216 226,250 204,214" fill="var(--bf-team)" />
          <polygon points="284,216 226,250 216,232 272,198" fill="#000" fillOpacity="0.18" />
          <polygon points="226,250 204,214 142,174 128,204" fill="#d2b9a0" />
          <polygon points="226,250 204,214 192,207 212,244" fill="var(--bf-accent)" />
          <polygon points="226,250 215,232 135,189 128,204" fill="#000" fillOpacity="0.14" />

          {/* Hands (gloves) */}
          <polygon points="118,158 152,166 154,198 122,198" fill="#14171c" />
          <polyline points="120,178 153,182" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="2.5" />

          {/* Neck and head: no facial features */}
          <polygon points="190,152 240,150 244,186 190,190" fill="#b8a08a" />
          <polygon points="178,96 262,92 266,150 238,170 196,168 176,134" fill="#d2b9a0" />
          <polygon points="178,96 214,94 214,168 196,168 176,134" fill="#000" fillOpacity="0.12" />

          {/* Helmet */}
          <path d="M166 104 C 164 54, 212 34, 244 44 C 272 52, 282 76, 280 98 L 166 110 Z" fill="var(--bf-team)" />
          <path d="M166 104 C 164 54, 212 34, 222 38 C 206 56, 202 84, 204 106 Z" fill="#000" fillOpacity="0.24" />
          <path d="M214 52 C 240 44, 262 60, 268 82 C 248 64, 230 56, 214 52 Z" fill="#fff" fillOpacity="0.2" />
          <path d="M214 40 C222 38 231 39 238 42 C232 62 230 84 231 104 L218 105 C217 82 217 60 214 40 Z" fill="var(--bf-accent)" />
          <polygon points="268,90 326,104 324,114 262,110" fill="var(--bf-team)" />
          <polygon points="268,90 326,104 324,114 262,110" fill="#000" fillOpacity="0.25" />
          <polygon points="166,104 206,106 206,146 176,140" fill="var(--bf-team)" />
          <polygon points="166,104 206,106 206,146 176,140" fill="#000" fillOpacity="0.3" />
          <circle cx="188" cy="124" r="11" fill="#000" fillOpacity="0.32" />
        </g>
      </g>
    </svg>
  );
}

export default BatterFigure;
