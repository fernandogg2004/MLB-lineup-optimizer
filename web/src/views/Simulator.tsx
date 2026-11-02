import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Announcements, DragEndEvent, ScreenReaderInstructions } from "@dnd-kit/core";
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
import { allowedMatrix, nextFreeSlot } from "./constraints";

function quantile(sorted: number[], q: number): number {
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

type SearchState =
  | { kind: "running"; p: number }
  | { kind: "done"; v: number; n: number }
  | { kind: "error"; message: string }
  | null;

function Row(props: {
  id: number;
  index: number;
  name: string;
  pos: string;
  locked: boolean;
  canUp: boolean;
  canDown: boolean;
  onLock: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.id,
    disabled: props.locked,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const slot = props.index + 1;
  const lockLabel = props.locked
    ? t("sim.unlock_named", { name: props.name, slot })
    : t("sim.lock_named", { name: props.name, slot });
  return (
    <li
      ref={setNodeRef}
      style={style}
      data-player={props.id}
      className={`sim-row ${isDragging ? "dragging" : ""} ${props.locked ? "locked" : ""}`}
    >
      <span className="slot" aria-hidden>
        {slot}
      </span>
      <button
        className="drag-handle"
        aria-label={t("sim.drag", { name: props.name })}
        disabled={props.locked}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden>⋮⋮</span>
      </button>
      <span className="sim-name">
        {props.name} <span className="text-muted text-xs">{props.pos}</span>
      </span>
      <span className="sim-controls">
        <button
          className="icon-btn"
          data-dir="up"
          aria-label={t("sim.move_up", { name: props.name })}
          aria-disabled={props.locked || !props.canUp}
          title={props.locked ? t("sim.locked_help") : !props.canUp ? t("sim.no_free_up") : undefined}
          onClick={() => props.canUp && !props.locked && props.onMove(-1)}
        >
          <span aria-hidden>↑</span>
        </button>
        <button
          className="icon-btn"
          data-dir="down"
          aria-label={t("sim.move_down", { name: props.name })}
          aria-disabled={props.locked || !props.canDown}
          title={props.locked ? t("sim.locked_help") : !props.canDown ? t("sim.no_free_down") : undefined}
          onClick={() => props.canDown && !props.locked && props.onMove(1)}
        >
          <span aria-hidden>↓</span>
        </button>
        <button
          className={`lock-btn ${props.locked ? "on" : ""}`}
          aria-pressed={props.locked}
          aria-label={lockLabel}
          title={lockLabel}
          onClick={props.onLock}
        >
          <span aria-hidden>{props.locked ? "🔒" : "🔓"}</span>
          {props.locked && <span className="lock-text" aria-hidden>{t("sim.locked")}</span>}
        </button>
      </span>
    </li>
  );
}

export function Simulator({ snap, team }: { snap: GameSnapshot; team: Team }) {
  const { t, fmt, signed, int } = useI18n();
  const kernel = useMemo(() => kernelFlat(snap), [snap]);
  const [order, setOrder] = useState<number[]>(team.actual.order);
  const [locks, setLocks] = useState<Record<number, number>>({});
  const [depth, setDepth] = useState(1);
  const [search, setSearch] = useState<SearchState>(null);
  const [announce, setAnnounce] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);
  const pendingFocus = useRef<{ player: number; dir: "up" | "down" } | null>(null);
  const listRef = useRef<HTMLOListElement | null>(null);

  useEffect(() => () => workerRef.current?.terminate(), []);

  // Keep keyboard focus inside the moved row (the clicked arrow may have become unavailable).
  useEffect(() => {
    const f = pendingFocus.current;
    if (!f || !listRef.current) return;
    pendingFocus.current = null;
    const row = listRef.current.querySelector<HTMLElement>(`[data-player="${f.player}"]`);
    if (!row) return;
    const same = row.querySelector<HTMLButtonElement>(`button[data-dir="${f.dir}"]`);
    const other = row.querySelector<HTMLButtonElement>(`button[data-dir="${f.dir === "up" ? "down" : "up"}"]`);
    (same?.getAttribute("aria-disabled") === "true" ? other : same)?.focus();
  }, [order]);

  const w = useMemo(() => scaleStarterDepth(team.regime_weights.flat(), 2, depth), [team, depth]);
  const op = useMemo(() => operators(kernel, matchupFlat(team, w)), [kernel, team, w]);
  const value = useMemo(() => evaluate(op, order).expectedRuns, [op, order]);
  const usedValue = useMemo(() => evaluate(op, team.actual.order).expectedRuns, [op, team]);
  // Paired difference (your order − order used) across the same posterior draws.
  const drawOps = useMemo(
    () => team.uncertainty.draws_x.map((d) => operators(kernel, { G: 2, x: drawFlat(d), w })),
    [team, kernel, w],
  );
  const usedByDraw = useMemo(
    () => drawOps.map((o) => evaluate(o, team.actual.order).expectedRuns),
    [drawOps, team],
  );
  // 400 exact evaluations per change: computed from a deferred copy so dragging stays responsive.
  const deferredOrder = useDeferredValue(order);
  const diffInterval = useMemo(() => {
    const d = drawOps.map((o, i) => evaluate(o, deferredOrder).expectedRuns - usedByDraw[i]).sort((a, b) => a - b);
    return [quantile(d, 0.05), quantile(d, 0.95)];
  }, [drawOps, usedByDraw, deferredOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const lockedSlots = new Set(Object.keys(locks).map(Number));
  const name = (p: number) => team.hitters[p].name;
  const slotOf = (id: number | string) => order.indexOf(Number(id)) + 1;

  function cancelSearch() {
    workerRef.current?.terminate();
    workerRef.current = null;
    reqId.current++;
    setSearch(null);
  }

  function moveTo(from: number, to: number) {
    if (to < 0 || to > 8 || lockedSlots.has(from) || lockedSlots.has(to) || from === to) return;
    cancelSearch();
    const free = order.map((_, i) => i).filter((i) => !lockedSlots.has(i));
    const sub = arrayMove(free.map((i) => order[i]), free.indexOf(from), free.indexOf(to));
    const next = order.slice();
    free.forEach((slot, k) => (next[slot] = sub[k]));
    setAnnounce(t("sim.announce_move", { name: name(order[from]), slot: to + 1 }));
    setOrder(next);
  }

  function step(from: number, dir: -1 | 1) {
    const to = nextFreeSlot(from, dir, lockedSlots);
    if (to === null) return;
    pendingFocus.current = { player: order[from], dir: dir < 0 ? "up" : "down" };
    moveTo(from, to);
  }

  function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = order.indexOf(Number(e.active.id));
    const to = order.indexOf(Number(e.over.id));
    if (lockedSlots.has(to)) {
      setAnnounce(t("sim.locked_help"));
      return;
    }
    moveTo(from, to);
  }

  function toggleLock(slot: number) {
    cancelSearch();
    setLocks((l) => {
      const n = { ...l };
      if (slot in n) delete n[slot];
      else n[slot] = order[slot];
      return n;
    });
  }

  function setAll(next: number[]) {
    cancelSearch();
    setOrder(next);
    setLocks({});
  }

  function runSearch() {
    cancelSearch();
    const worker = new Worker(new URL("../engine/worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    const id = ++reqId.current;
    setSearch({ kind: "running", p: 0 });
    worker.onmessage = (ev: MessageEvent<SearchMessage>) => {
      const m = ev.data;
      if (m.id !== reqId.current || m.id !== id) return; // stale: the user changed something
      if (m.type === "progress") setSearch({ kind: "running", p: m.fraction });
      else if (m.type === "done") {
        setSearch({ kind: "done", v: m.bestValue, n: m.feasible });
        setOrder(m.best);
        worker.terminate();
        workerRef.current = null;
      } else setSearch({ kind: "error", message: m.message });
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

  const announcements: Announcements = {
    onDragStart: ({ active }) => t("sim.dnd_start", { name: name(Number(active.id)), slot: slotOf(active.id) }),
    onDragOver: ({ active, over }) =>
      over ? t("sim.dnd_over", { name: name(Number(active.id)), slot: slotOf(over.id) }) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? t("sim.dnd_end", { name: name(Number(active.id)), slot: slotOf(over.id) }) : undefined,
    onDragCancel: ({ active }) => t("sim.dnd_cancel", { name: name(Number(active.id)), slot: slotOf(active.id) }),
  };
  const instructions: ScreenReaderInstructions = { draggable: t("sim.dnd_instructions") };
  const running = search?.kind === "running";

  return (
    <section className="card" aria-labelledby="sim-title">
      <h2 id="sim-title" className="card-title">
        {t("sim.title")} — {team.name}
      </h2>
      <p className="card-sub">{t("sim.subtitle")}</p>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] mt-4">
        <div className="min-w-0">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
            accessibility={{ announcements, screenReaderInstructions: instructions }}
          >
            <SortableContext items={order} strategy={verticalListSortingStrategy}>
              <ol className="sim-list" aria-label={t("sim.your")} ref={listRef}>
                {order.map((p, i) => (
                  <Row
                    key={p}
                    id={p}
                    index={i}
                    name={team.hitters[p].name}
                    pos={team.hitters[p].pos}
                    locked={lockedSlots.has(i)}
                    canUp={nextFreeSlot(i, -1, lockedSlots) !== null}
                    canDown={nextFreeSlot(i, 1, lockedSlots) !== null}
                    onLock={() => toggleLock(i)}
                    onMove={(d) => step(i, d)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
          <div aria-live="polite" className="sr-only">
            {announce}
          </div>
          <p className="text-xs text-muted mt-2">{t("sim.locks_note")}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <button className="btn" onClick={() => setAll(team.actual.order)}>
              {t("sim.reset")}
            </button>
            <button className="btn" onClick={() => setAll(team.optimal.order)}>
              {t("sim.load_opt")}
            </button>
            {running ? (
              <button className="btn" onClick={cancelSearch}>
                {t("sim.cancel")}
              </button>
            ) : (
              <button className="btn btn-primary" onClick={runSearch}>
                {t("sim.find")}
              </button>
            )}
          </div>
          <div className="mt-2 text-sm" aria-live="polite">
            {search?.kind === "running" && (
              <div>
                {t("sim.finding", { p: Math.round(search.p * 100) })}
                <progress className="w-full" max={1} value={search.p} />
              </div>
            )}
            {search?.kind === "done" && t("sim.found", { v: fmt(search.v, 3), n: int(search.n) })}
            {search?.kind === "error" && <span className="text-warn">{search.message}</span>}
          </div>
        </div>
        <div className="min-w-0">
          <div className="stat">
            <div className="stat-label">
              {t("sim.your_value")} <span className="badge badge-model">{t("game.model")}</span>
            </div>
            <div className="stat-value">{fmt(value, 3)}</div>
            <div className="stat-sub">
              {t("kpi.runs9")} · {t("sim.exact")}
            </div>
          </div>
          <dl className="grid grid-cols-1 gap-3 mt-4 text-sm">
            <div className="mini">
              <dt className="text-muted">{t("sim.vs_used")}</dt>
              <dd className="mini-val">{signed(value - usedValue, 3)}</dd>
              <dd className="text-xs text-muted mt-1">
                {t("sim.interval", {
                  n: team.uncertainty.draws_x.length,
                  lo: signed(diffInterval[0], 3),
                  hi: signed(diffInterval[1], 3),
                })}
              </dd>
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
              onChange={(e) => {
                cancelSearch();
                setDepth(Number(e.target.value));
              }}
              className="w-full mt-2"
              aria-valuetext={depth === 1 ? t("sim.depth_default") : depth < 1 ? t("sim.depth_short") : t("sim.depth_long")}
            />
            <div className="flex justify-between items-center text-xs text-muted">
              <span>{t("sim.depth_short")}</span>
              <button
                className="link-btn text-xs"
                onClick={() => {
                  cancelSearch();
                  setDepth(1);
                }}
              >
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
