import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import { useI18n } from "../../i18n-context";
import { useWidth } from "./hooks";

/** Fades in as it enters the screen. CSS alone drives it, so jumping to a section never finds it hidden. */
export function Reveal({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`st-reveal ${className}`}>{children}</div>;
}

export function Seg<T extends string>(props: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="st-seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.value} type="button" aria-pressed={props.value === o.value} onClick={() => props.onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export type SeriesKind = "opt" | "act" | "pos" | "neutral" | "gold" | "book";

export function Legend({ items }: { items: { kind: SeriesKind; label: string; shape?: "line" | "dot" }[] }) {
  return (
    <ul className="st-legend">
      {items.map((i) => (
        <li key={i.label}>
          <span className={`st-key st-key-${i.kind} st-key-${i.shape ?? "box"}`} aria-hidden="true" />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

export function Figure(props: {
  title: string;
  sub?: ReactNode;
  controls?: ReactNode;
  legend?: ReactNode;
  read?: ReactNode;
  table?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <section className={`st-card ${props.className ?? ""}`} aria-labelledby={id}>
      <h3 id={id} className="st-card-title">
        {props.title}
      </h3>
      {props.sub && <p className="st-card-sub">{props.sub}</p>}
      {(props.controls || props.legend) && (
        <div className="st-controls">
          {props.controls}
          {props.legend}
        </div>
      )}
      <div className="st-figure">{props.children}</div>
      {props.read && <p className="st-read">{props.read}</p>}
      {props.table && (
        <details className="st-data">
          <summary>{t("st.data_table")}</summary>
          <div className="st-scroll" tabIndex={0} role="region" aria-label={t("st.data_of", { title: props.title })}>
            {props.table}
          </div>
        </details>
      )}
    </section>
  );
}

/**
 * Interactive SVG surface. One tab stop: arrow keys step through the points and a tap or hover picks
 * one. The tooltip text is also announced, and every chart has a data table beside it.
 */
export function Chart(props: {
  label: string;
  height: number | ((w: number) => number);
  count: number;
  indexAt: (x: number, y: number, w: number) => number | null;
  anchor: (i: number, w: number) => { x: number; y: number };
  tip: (i: number) => ReactNode;
  draw: (w: number, i: number | null) => ReactNode;
}) {
  const { t } = useI18n();
  const [ref, w] = useWidth();
  const [i, setI] = useState<number | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [tipW, setTipW] = useState(200);
  const { count, indexAt } = props;
  const h = typeof props.height === "function" ? props.height(w) : props.height;
  const shown = i !== null && i < count ? i : null;
  const pick = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const r = e.currentTarget.getBoundingClientRect();
      setI(indexAt(e.clientX - r.left, e.clientY - r.top, r.width));
    },
    [indexAt],
  );
  const key = (e: KeyboardEvent) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (step) {
      e.preventDefault();
      setI((v) => (v === null ? 0 : Math.max(0, Math.min(count - 1, v + step))));
    } else if (e.key === "Home") {
      e.preventDefault();
      setI(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setI(count - 1);
    } else if (e.key === "Escape") setI(null);
  };
  useEffect(() => {
    if (tipRef.current) setTipW(tipRef.current.offsetWidth);
  }, [shown]);
  const at = shown === null ? null : props.anchor(shown, w);
  return (
    <div
      ref={ref}
      className="st-chart"
      style={{ height: h }}
      tabIndex={0}
      role="group"
      aria-label={`${props.label} ${t("st.chart_keys")}`}
      onKeyDown={key}
      onPointerMove={pick}
      onPointerDown={pick}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") setI(null);
      }}
      onBlur={() => setI(null)}
    >
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
        {props.draw(w, shown)}
      </svg>
      {shown !== null && at && (
        <div
          ref={tipRef}
          className="st-tip"
          style={{
            left: Math.max(0, Math.min(w - tipW, at.x - tipW / 2)),
            top: Math.max(0, at.y - 12),
            transform: "translateY(-100%)",
          }}
        >
          {props.tip(shown)}
        </div>
      )}
      <div className="sr-only" role="status">
        {shown !== null ? props.tip(shown) : ""}
      </div>
    </div>
  );
}

export function Bases({ first, second, third, size = 26 }: { first: boolean; second: boolean; third: boolean; size?: number }) {
  const base = (x: number, y: number, on: boolean, k: string) => (
    <rect key={k} x={x - 4.2} y={y - 4.2} width={8.4} height={8.4} transform={`rotate(45 ${x} ${y})`} className={on ? "st-base st-base-on" : "st-base"} />
  );
  return (
    <svg className="st-bases" width={size} height={size} viewBox="0 0 28 28" aria-hidden="true">
      {base(14, 7, second, "2")}
      {base(7, 14, third, "3")}
      {base(21, 14, first, "1")}
      <path d="M14 26 L10.6 22.6 L10.6 20 L17.4 20 L17.4 22.6 Z" className="st-plate" />
    </svg>
  );
}
