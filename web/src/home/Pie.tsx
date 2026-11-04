import { useState } from "react";
import { useI18n } from "../i18n-context";
import type { Key } from "../strings";
import { pieSlices, type Slice } from "./derive";
import { COMPACT_PIE_QUERY, percentText, useMedia } from "./format";

function polar(cx: number, cy: number, r: number, a: number): [number, number] {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

function wrap(text: string, max: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(" ")) {
    if (line && `${line} ${w}`.length > max) {
      out.push(line);
      line = w;
    } else line = line ? `${line} ${w}` : w;
  }
  out.push(line);
  return out;
}

/** Interactive outcome pie: every slice carries its percentage and name without hovering. */
export function Pie({ probs, caption, against }: { probs: number[]; caption: string; against: string }) {
  const { t, lang } = useI18n();
  const [hot, setHot] = useState(-1);
  const compact = useMedia(COMPACT_PIE_QUERY);
  const slices = pieSlices(probs);
  const text = (s: Slice) => `${s.belowOne ? `<${percentText(1, lang)}` : percentText(s.percent, lang)} ${t(`slice.${s.key}` as Key)}`;

  const W = compact ? 400 : 520;
  const H = compact ? 236 : 248;
  const r = compact ? 58 : 86;
  const gapY = compact ? 36 : 25;
  const reach = compact ? 18 : 34;
  const cx = W / 2;
  const cy = H / 2;

  const arcs = slices.map((s, i) => {
    const a0 = slices.slice(0, i).reduce((sum, x) => sum + x.value, 0) * 2 * Math.PI;
    const a1 = a0 + s.value * 2 * Math.PI;
    return { s, i, a0, a1, mid: (a0 + a1) / 2 };
  });
  // Labels go on the slice's side, pushed apart so they never overlap.
  const labels = arcs.map((a) => {
    const [ex, ey] = polar(cx, cy, r + 13, a.mid);
    return { ...a, ex, ey, right: a.mid < Math.PI, y: ey };
  });
  for (const right of [true, false]) {
    const side = labels.filter((l) => l.right === right).sort((a, b) => a.y - b.y);
    for (let k = 1; k < side.length; k++) if (side[k].y - side[k - 1].y < gapY) side[k].y = side[k - 1].y + gapY;
    const over = side.length ? side[side.length - 1].y - (H - 12) : 0;
    if (over > 0) {
      side[side.length - 1].y -= over;
      for (let k = side.length - 2; k >= 0; k--) if (side[k + 1].y - side[k].y < gapY) side[k].y = side[k + 1].y - gapY;
    }
  }

  return (
    <>
      <svg className="pie" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={caption}>
        {arcs.map(({ s, i, a0: from, a1: to, mid }) => {
          const [x0, y0] = polar(cx, cy, r, from);
          const [x1, y1] = polar(cx, cy, r, to);
          const large = to - from > Math.PI ? 1 : 0;
          const on = hot === i;
          const [dx, dy] = on ? polar(0, 0, 4, mid) : [0, 0];
          return (
            <g key={s.key} className="slice-group" transform={`translate(${dx} ${dy})`}>
              <path
                className={on ? "slice on" : "slice"}
                d={`M${cx} ${cy}L${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}Z`}
                style={{ fill: `var(--pie-${s.key})`, color: `var(--pie-${s.key})` }}
                tabIndex={0}
                role="img"
                aria-label={text(s)}
                onPointerEnter={() => setHot(i)}
                onPointerLeave={() => setHot(-1)}
                onClick={() => setHot(i)}
                onFocus={() => setHot(i)}
                onBlur={() => setHot(-1)}
              />
              <path className="pie-edge" d={`M${x0} ${y0}A${r} ${r} 0 ${large} 1 ${x1} ${y1}`} />
            </g>
          );
        })}
        {labels.map((l) => {
          const on = hot === l.i;
          const tx = l.right ? cx + r + reach : cx - r - reach;
          const lines = compact ? wrap(text(l.s), 17) : [text(l.s)];
          return (
            <g key={l.s.key} className={hot >= 0 && !on ? "pie-row dim" : "pie-row"} aria-hidden="true">
              <polyline className="pie-leader" points={`${l.ex},${l.ey} ${tx - (l.right ? 6 : -6)},${l.y} ${tx - (l.right ? 1 : -1)},${l.y}`} />
              <text x={tx} y={l.y + 4 - (lines.length - 1) * 7} textAnchor={l.right ? "start" : "end"} className={`pie-label ${compact ? "compact" : ""} ${on ? "on" : ""}`}>
                {lines.map((ln, k) => {
                  const pct = k === 0 ? ln.slice(0, ln.indexOf(" ")) : "";
                  return (
                    <tspan key={k} x={tx} dy={k ? 15 : 0}>
                      {pct && <tspan className="pie-pct">{pct}</tspan>}
                      {pct ? ln.slice(pct.length) : ln}
                    </tspan>
                  );
                })}
              </text>
            </g>
          );
        })}
      </svg>
      <table className="sr-only">
        <caption>
          {caption}. {against}
        </caption>
        <tbody>
          {slices.map((s) => (
            <tr key={s.key}>
              <th scope="row">{t(`slice.${s.key}` as Key)}</th>
              <td>{s.belowOne ? `<${percentText(1, lang)}` : percentText(s.percent, lang)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
