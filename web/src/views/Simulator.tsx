import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { evaluate, operators, scaleStarterDepth } from "../engine/markov";
import type { SearchMessage, SearchRequest } from "../engine/worker";
import { drawFlat, kernelFlat, matchupFlat } from "../data";
import type { GameSnapshot, Team } from "../data";
import { useI18n } from "../i18n-context";
import { allowedMatrix, locksConsistent } from "./constraints";

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

function Row(props: {
  id: number;
  index: number;
  name: string;
  pos: string;
  locked: boolean;
  onLock: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    disabled: props.locked,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <li ref={setNodeRef} style={style} className={`sim-row ${isDragging ? "dragging" : ""} ${props.locked ? "locked" : ""}`}>
      <span className="slot">{props.index + 1}</span>
      <button
        className="drag-handle"
        aria-label={t("sim.drag", { name: props.name })}
        disabled={props.locked}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="flex-1 min-w-0 truncate">
        {props.name} <span className="text-muted text-xs">{props.pos}</span>
      </span>
      <button className="icon-btn" aria-label={t("sim.move_up", { name: props.name })} disabled={props.locked || props.index === 0} onClick={() => props.onMove(-1)}>
        ↑
      </button>
      <button className="icon-btn" aria-label={t("sim.move_down", { name: props.name })} disabled={props.locked || props.index === 8} onClick={() => props.onMove(1)}>
        ↓
      </button>
      <button className={`lock-btn ${props.locked ? "on" : ""}`} aria-pressed={props.locked} onClick={props.onLock} title={props.locked ? t("sim.unlock") : t("sim.lock")}>
        {props.locked ? `🔒 ${t("sim.locked")}` : "🔓"}
        <span className="sr-only">{props.locked ? t("sim.unlock") : t("sim.lock")}</span>
      </button>
    </li>
  );
}

export function Simulator({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, fmt, signed, int } = useI18n();
  const kernel = useMemo(() => kernelFlat(snap), [snap]);
  const [order, setOrder] = useState<number[]>(team.actual.order);
  const [locks, setLocks] = useState<Record<number, number>>({});
  const [depth, setDepth] = useState(1);
  const [search, setSearch] = useState<{ p: number } | { best: number[]; v: number; n: number } | { err: string } | null>(null);
  const [announce, setAnnounce] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const w = useMemo(() => scaleStarterDepth(team.regime_weights.flat(), 2, depth), [team, depth]);
  const op = useMemo(() => operators(kernel, matchupFlat(team, w)), [kernel, team, w]);
  const value = useMemo(() => evaluate(op, order).expectedRuns, [op, order]);
  const ref = useMemo(
    () => ({ used: evaluate(op, team.actual.order).expectedRuns, opt: evaluate(op, team.optimal.order).expectedRuns }),
    [op, team],
  );
  const interval = useMemo(() => {
    const vals = team.uncertainty.draws_x.map((d) => evaluate(operators(kernel, { G: 2, x: drawFlat(d), w }), order).expectedRuns);
    vals.sort((a, b) => a - b);
    return [quantile(vals, 0.05), quantile(vals, 0.95)];
  }, [team, kernel, w, order]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const lockedSlots = new Set(Object.keys(locks).map(Number));
  const name = (p: number) => team.hitters[p].name;

  function move(from: number, to: number) {
    if (to < 0 || to > 8 || lockedSlots.has(from) || lockedSlots.has(to)) return;
    setOrder((o) => {
      // Moving across locked slots: perform the move on the unlocked positions only.
      const free = o.map((_, i) => i).filter((i) => !lockedSlots.has(i));
      const fi = free.indexOf(from);
      const ti = free.indexOf(to);
      const sub = arrayMove(free.map((i) => o[i]), fi, ti);
      const next = o.slice();
      free.forEach((slot, k) => (next[slot] = sub[k]));
      setAnnounce(t("sim.announce_move", { name: name(o[from]), slot: to + 1 }));
      return next;
    });
    setSearch(null);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    move(order.indexOf(Number(e.active.id)), order.indexOf(Number(e.over.id)));
  }

  function toggleLock(slot: number) {
    setLocks((l) => {
      const n = { ...l };
      if (slot in n) delete n[slot];
      else n[slot] = order[slot];
      return n;
    });
    setSearch(null);
  }

  function runSearch() {
    if (!locksConsistent(locks)) {
      setSearch({ err: t("sim.infeasible") });
      return;
    }
    workerRef.current?.terminate();
    const worker = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const id = ++reqId.current;
    setSearch({ p: 0 });
    worker.onmessage = (ev: MessageEvent<SearchMessage>) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === "progress") setSearch({ p: m.fraction });
      else if (m.type === "done") {
        setSearch({ best: m.best, v: m.bestValue, n: m.feasible });
        setOrder(m.best);
        worker.terminate();
      } else setSearch({ err: m.message });
    };
    const req: SearchRequest = {
      id,
      kernel,
      matchup: matchupFlat(team, w),
      allowed: Object.keys(locks).length ? allowedMatrix(locks) : null,
      histRange: [0, 20],
    };
    worker.postMessage(req);
  }

  return (
    <section className="card" aria-labelledby="sim-title">
      <h3 id="sim-title" className="card-title">
        {t("sim.title")} — {team.name}
      </h3>
      <p className="card-sub">{t("sim.subtitle")}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] mt-4">
        <div className="min-w-0">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ol className="sim-list" aria-label={t("sim.your")}>
                {order.map((p, i) => (
                  <Row
                    key={p}
                    id={p}
                    index={i}
                    name={team.hitters[p].name}
                    pos={team.hitters[p].pos}
                    locked={lockedSlots.has(i)}
                    onLock={() => toggleLock(i)}
                    onMove={(d) => move(i, i + d)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <div aria-live="polite" className="sr-only">
            {announce}
          </div>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn" onClick={() => { setOrder(team.actual.order); setLocks({}); setSearch(null); }}>
              {t("sim.reset")}
            </button>
            <button className="btn" onClick={() => { setOrder(team.optimal.order); setLocks({}); setSearch(null); }}>
              {t("sim.load_opt")}
            </button>
            <button className="btn btn-primary" onClick={runSearch} disabled={search !== null && "p" in search}>
              {t("sim.find")}
            </button>
          </div>
          <div className="mt-2 text-sm" aria-live="polite">
            {search && "p" in search && (
              <div>
                {t("sim.finding", { p: Math.round(search.p * 100) })}
                <progress className="w-full" max={1} value={search.p} />
              </div>
            )}
            {search && "best" in search && t("sim.found", { v: fmt(search.v, 3), n: int(search.n) })}
            {search && "err" in search && <span className="text-warn">{search.err}</span>}
          </div>
        </div>
        <div className="min-w-0">
          <div className="stat">
            <div className="stat-label">
              {t("sim.your_value")} <span className="badge badge-model">{t("game.model")}</span>
            </div>
            <div className="stat-value">{fmt(value, 3)}</div>
            <div className="stat-sub">{t("kpi.runs9")} · {t("sim.exact")}</div>
            <div className="stat-sub">{t("sim.interval", { n: team.uncertainty.draws_x.length, lo: fmt(interval[0], 2), hi: fmt(interval[1], 2) })}</div>
          </div>
          <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
            <div className="mini">
              <dt className="text-muted">{t("sim.vs_used")}</dt>
              <dd className="mini-val">{signed(value - ref.used, 3)}</dd>
            </div>
            <div className="mini">
              <dt className="text-muted">{t("sim.vs_opt")}</dt>
              <dd className="mini-val">{signed(value - ref.opt, 3)}</dd>
            </div>
          </dl>
          <div className="mt-5">
            <label htmlFor="depth" className="font-medium">
              {t("sim.depth")}
            </label>
            <p className="text-sm text-muted">{t("sim.depth_help")}</p>
            <input
              id="depth"
              type="range"
              min={0.5}
              max={2}
              step={0.1}
              value={depth}
              onChange={(e) => setDepth(Number(e.target.value))}
              className="w-full mt-2"
              aria-valuetext={depth === 1 ? t("sim.depth_default") : depth < 1 ? t("sim.depth_short") : t("sim.depth_long")}
            />
            <div className="flex justify-between text-xs text-muted">
              <span>{t("sim.depth_short")}</span>
              <button className="link-btn text-xs" onClick={() => setDepth(1)}>
                {t("sim.depth_default")}
              </button>
              <span>{t("sim.depth_long")}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
