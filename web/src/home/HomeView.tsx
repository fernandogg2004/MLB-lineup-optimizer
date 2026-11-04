import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchJson, validateHome, type HomeData } from "../data";
import { useI18n } from "../i18n-context";
import { SUMMARY_SCREEN } from "../route";
import type { Theme } from "../theme";
import { BatterScreen, type PlayerPhoto } from "./BatterScreen";
import { ordinal } from "./derive";
import { lineupFigures } from "./figures";
import { prefersReducedMotion, useFlow } from "./format";
import { setStadiumDepth } from "./stadium";
import { SummaryScreen } from "./SummaryScreen";
import "./home.css";

const MOVE_MS = 850;
const GESTURE_GAP_MS = 240;
/** How long after landing a steady, undiminished stream counts as asking for the next screen. */
const SETTLE_MS = 250;

function Screens(props: {
  data: HomeData;
  side: "away" | "home";
  /** Requested screen; a new object means the URL changed (deep link or back button). */
  target: { screen: number };
  theme: Theme;
  menuOpen: boolean;
  photos: PlayerPhoto[];
  onScreen: (screen: number) => void;
}) {
  const { data, side, target, theme, menuOpen, photos, onScreen } = props;
  const { t, lang } = useI18n();
  const team = data.teams[side];
  const flow = useFlow();
  const scroller = useRef<HTMLDivElement>(null);
  const [locked, setLocked] = useState<number | null>(target.screen);
  const [progress, setProgress] = useState(target.screen);
  const [nearSummary, setNearSummary] = useState(false);
  const [vsBullpen, setVsBullpen] = useState(false);
  const anim = useRef({ running: false, lastWheel: -Infinity, armed: true, raf: 0, pending: 0, landedAt: -Infinity, recent: [] as { size: number; at: number }[], steady: 0 });
  const menuRef = useRef(menuOpen);
  useEffect(() => {
    menuRef.current = menuOpen;
  }, [menuOpen]);

  const screenHeight = () => scroller.current?.querySelector<HTMLElement>(".screen")?.getBoundingClientRect().height ?? 1;
  // The screen the visitor is on, kept through rotation and resizing.
  const current = useRef(target.screen);
  const place = useCallback(
    (i: number) => {
      const el = scroller.current;
      if (!el) return;
      if (flow) el.querySelector(`.screen[data-screen="${i}"]`)?.scrollIntoView();
      else el.scrollTop = i * screenHeight();
    },
    [flow],
  );

  // Deep links and the back button: run first, so nothing reports the wrong screen meanwhile.
  useLayoutEffect(() => {
    current.current = target.screen;
    place(target.screen);
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rotating into or out of normal scrolling keeps the same batter.
  useLayoutEffect(() => {
    place(current.current);
  }, [place]);

  // Visuals follow the scroll position: depth, fade, and which screen is locked.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const clear = () =>
      el.querySelectorAll<HTMLElement>(".screen, .layer").forEach((n) => {
        n.style.removeProperty("visibility");
        n.style.removeProperty("opacity");
        n.style.removeProperty("transform");
      });
    if (flow) {
      clear();
      setStadiumDepth(0);
      let frame = 0;
      const onFlowScroll = () => {
        if (frame) return;
        frame = requestAnimationFrame(() => {
          frame = 0;
          const screens = [...el.querySelectorAll<HTMLElement>(".screen")];
          const seen = screens.filter((s) => s.offsetTop <= el.scrollTop + el.clientHeight / 2).length - 1;
          current.current = Math.max(0, seen);
          onScreen(current.current);
        });
      };
      el.addEventListener("scroll", onFlowScroll, { passive: true });
      return () => {
        el.removeEventListener("scroll", onFlowScroll);
        cancelAnimationFrame(frame);
      };
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const h = screenHeight();
      const y = el.scrollTop / h;
      const nearest = Math.max(0, Math.min(SUMMARY_SCREEN, Math.round(y)));
      const isLocked = Math.abs(y - nearest) < 0.02;
      if (isLocked) current.current = nearest;
      setProgress(nearest);
      setLocked(isLocked ? nearest : null);
      setNearSummary(y > SUMMARY_SCREEN - 1 + 0.02);
      const still = prefersReducedMotion();
      if (!still) setStadiumDepth(y);
      el.querySelectorAll<HTMLElement>(".screen").forEach((s) => {
        const p = Number(s.dataset.screen) - y; // 0 at the lock, +1 below, -1 above
        // Screens out of view leave the tab order and stop painting.
        const hidden = isLocked ? Number(s.dataset.screen) !== nearest : Math.abs(p) >= 0.999;
        s.style.visibility = hidden ? "hidden" : "visible";
        if (still) return;
        s.querySelectorAll<HTMLElement>(".layer").forEach((l) => {
          const depth = Number(l.dataset.depth ?? 0.2);
          const k = Math.min(1, Math.abs(p) * 1.5);
          l.style.opacity = String(1 - k * k);
          l.style.transform = `translate3d(0, ${(p * h * depth).toFixed(1)}px, 0)`;
        });
      });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      if (!anim.current.running) el.scrollTop = current.current * screenHeight();
      onScroll();
    };
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(frame);
    };
  }, [flow, onScreen]);

  // The lock: one gesture moves one screen. Browser snapping alone does not hold on a wheel (a large
  // delta skips screens and a small one bounces back), so wheel and keyboard are moved here while
  // touch keeps native snapping with scroll-snap-stop.
  const jump = useCallback(
    (target: number) => {
      const el = scroller.current;
      if (!el) return;
      const a = anim.current;
      const start = (wanted: number) => {
      const i = Math.max(0, Math.min(SUMMARY_SCREEN, wanted));
      if (flow) {
        el.querySelector(`.screen[data-screen="${i}"]`)?.scrollIntoView();
        return;
      }
      const from = el.scrollTop / screenHeight();
      cancelAnimationFrame(a.raf);
      if (prefersReducedMotion() || from === i) {
        a.running = false;
        el.style.removeProperty("scroll-snap-type");
        el.scrollTop = i * screenHeight();
        return;
      }
      a.running = true;
      el.style.scrollSnapType = "none";
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / MOVE_MS);
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
        // Positions are in screens, so a resize during the move still lands on the right one.
        el.scrollTop = (from + (i - from) * e) * screenHeight();
        if (k < 1) a.raf = requestAnimationFrame(step);
        else {
          el.style.removeProperty("scroll-snap-type");
          a.running = false;
          a.landedAt = now;
          // A gesture made during the move is honoured as soon as it lands.
          const next = a.pending;
          a.pending = 0;
          if (next) start(i + next);
        }
      };
      a.raf = requestAnimationFrame(step);
      };
      start(target);
    },
    [flow],
  );

  // Attached before the first paint, so input is never lost in the moment after the page appears.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el || flow) return;
    const a = anim.current;
    const current = () => Math.round(el.scrollTop / screenHeight());
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // browser zoom
      e.preventDefault();
      // One gesture moves one screen. A trackpad keeps sending events while it coasts after a flick,
      // so a new gesture is recognised by a pause, or by the stream picking up again. The event's own
      // timestamp is used because a busy page delivers events late, which would look like pauses.
      const size = Math.abs(e.deltaY);
      const paused = e.timeStamp - a.lastWheel > GESTURE_GAP_MS;
      a.lastWheel = e.timeStamp;
      const sample = { size, at: e.timeStamp };
      a.recent = paused ? [sample] : [...a.recent, sample].slice(-8);
      if (paused) {
        a.armed = true;
        a.steady = 0;
      } else if (!a.armed && a.recent.length === 8) {
        // Size and speed must agree. A browser merges events during a slow frame, which makes single
        // events bigger without speeding up; uneven delivery changes speed without bigger events.
        const window = (from: number, to: number) => {
          const part = a.recent.slice(from, to + 1);
          const total = part.reduce((sum, r) => sum + r.size, 0);
          return { size: total / part.length, speed: total / Math.max(1, part[part.length - 1].at - part[0].at) };
        };
        const older = window(0, 3);
        const newer = window(4, 7);
        const pickedUp = newer.size > older.size * 1.3 && newer.speed > older.speed * 1.3 && newer.size >= 8;
        // Coasting fades away; a steady stream long after landing is a wheel still being turned.
        const settled = !a.running && e.timeStamp - a.landedAt > SETTLE_MS;
        const holding = newer.size >= older.size && newer.speed >= older.speed && newer.size >= 30;
        a.steady = settled && holding ? a.steady + 1 : 0;
        if (pickedUp || a.steady >= 4) a.armed = true;
      }
      if (!a.armed || size < 4) return;
      a.armed = false;
      a.recent = [];
      a.steady = 0;
      const dir = Math.sign(e.deltaY);
      if (a.running) a.pending = dir;
      else jump(current() + dir);
    };
    const onKey = (e: KeyboardEvent) => {
      if (menuRef.current || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.closest?.("select, input, textarea, .menu")) return;
      if (e.key === " " && target.closest?.("a, button")) return;
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        a.pending = 0;
        jump(e.key === "Home" ? 0 : SUMMARY_SCREEN);
        return;
      }
      const dir = ({ ArrowDown: 1, PageDown: 1, " ": e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1 } as Record<string, number>)[e.key];
      if (!dir) return;
      e.preventDefault();
      if (a.running) a.pending = dir;
      else jump(current() + dir);
    };
    // A finger takes over from any move in progress.
    const onTouch = () => {
      cancelAnimationFrame(a.raf);
      a.running = false;
      a.pending = 0;
      el.style.removeProperty("scroll-snap-type");
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("touchstart", onTouch, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchstart", onTouch);
      window.removeEventListener("keydown", onKey);
    };
  }, [flow, jump]);

  // Keep the address shareable without filling the back history.
  useEffect(() => {
    if (!flow && locked !== null) onScreen(locked);
  }, [flow, locked, onScreen]);

  const hitters = team.optimal.order.map((i) => team.hitters[i]);
  const announced =
    flow || locked === null ? "" : locked === SUMMARY_SCREEN ? t("sum.head") : `${ordinal(locked + 1, lang)}. ${hitters[locked].name}`;
  const figures = lineupFigures(hitters.map((h) => h.id));

  return (
    <>
      <div className={`scroller ${flow ? "flow" : ""}`} ref={scroller} tabIndex={flow ? 0 : undefined} role="region" aria-label={t("home.title", { team: team.name })}>
        {team.optimal.order.map((hitter, slot) => (
          <BatterScreen
            key={slot}
            data={data}
            team={team}
            slot={slot}
            theme={theme}
            active={flow || locked === slot}
            vsBullpen={vsBullpen}
            setVsBullpen={setVsBullpen}
            photo={photos.find((p) => p.id === team.hitters[hitter].id)}
            figure={figures[slot]}
          />
        ))}
        <SummaryScreen data={data} team={team} on={flow || locked === SUMMARY_SCREEN} spinning={nearSummary} />
      </div>
      {!flow && (
        <nav className="rail" aria-label={t("home.rail")}>
          {hitters.map((h, s) => (
            <button key={s} aria-current={progress === s ? "step" : undefined} aria-label={`${ordinal(s + 1, lang)}, ${h.name}`} title={h.name} onClick={() => jump(s)}>
              <span />
            </button>
          ))}
          <button
            className="sumdot"
            aria-current={progress === SUMMARY_SCREEN ? "step" : undefined}
            aria-label={t("home.skip")}
            title={t("home.skip")}
            onClick={() => jump(SUMMARY_SCREEN)}
          >
            <span />
          </button>
          {progress === 0 && <i className="rail-hint" aria-hidden="true" />}
        </nav>
      )}
      <p className="sr-only" aria-live="polite">
        {announced}
      </p>
    </>
  );
}

export function HomeView(props: {
  pk: number;
  team: string;
  target: { screen: number };
  theme: Theme;
  menuOpen: boolean;
  onScreen: (screen: number) => void;
}) {
  const { pk, team, target, theme, menuOpen, onScreen } = props;
  const { t } = useI18n();
  const [loaded, setLoaded] = useState<{ pk: number; data: HomeData | null } | null>(null);
  const [photos, setPhotos] = useState<PlayerPhoto[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<HomeData>(`home/${pk}.json`)
      .then((d) => {
        validateHome(d);
        if (!cancelled) setLoaded({ pk, data: d });
      })
      .catch(() => {
        if (!cancelled) setLoaded({ pk, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [pk]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}players/manifest.json`)
      .then((r) => (r.ok ? (r.json() as Promise<{ players: PlayerPhoto[] }>) : { players: [] }))
      .then((m) => setPhotos(m.players))
      .catch(() => setPhotos([]));
  }, []);

  const current = loaded && loaded.pk === pk ? loaded : null;
  if (!current) {
    return (
      <p className="home-message" aria-busy="true">
        {t("game.loading")}
      </p>
    );
  }
  if (!current.data) {
    return (
      <p className="home-message" role="alert">
        {t("game.error")}
      </p>
    );
  }
  const data = current.data;
  const side = data.teams.home.team === team ? "home" : "away";
  return (
    <Screens
      key={`${pk}-${side}`}
      data={data}
      side={side}
      target={target}
      theme={theme}
      menuOpen={menuOpen}
      photos={photos}
      onScreen={onScreen}
    />
  );
}
