import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchJson, validateHome, type HomeData } from "../data";
import { useI18n } from "../i18n-context";
import { SUMMARY_SCREEN } from "../route";
import type { Theme } from "../theme";
import { BatterScreen, type PlayerPhoto } from "./BatterScreen";
import { ordinal } from "./derive";
import { prefersReducedMotion, useFlow } from "./format";
import { setStadiumDepth } from "./stadium";
import { SummaryScreen } from "./SummaryScreen";
import "./home.css";

const MOVE_MS = 850;
const GESTURE_GAP_MS = 240;

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
  const anim = useRef({ running: false, lastWheel: -Infinity, armed: true, raf: 0 });
  const menuRef = useRef(menuOpen);
  useEffect(() => {
    menuRef.current = menuOpen;
  }, [menuOpen]);

  const screenHeight = () => scroller.current?.querySelector<HTMLElement>(".screen")?.offsetHeight ?? 1;

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
      return;
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      const h = screenHeight();
      const y = el.scrollTop / h;
      const nearest = Math.max(0, Math.min(SUMMARY_SCREEN, Math.round(y)));
      setProgress(nearest);
      setLocked(Math.abs(y - nearest) < 0.02 ? nearest : null);
      setNearSummary(y > SUMMARY_SCREEN - 1 + 0.02);
      const still = prefersReducedMotion();
      if (!still) setStadiumDepth(y);
      el.querySelectorAll<HTMLElement>(".screen").forEach((s) => {
        const p = Number(s.dataset.screen) - y; // 0 at the lock, +1 below, -1 above
        // Screens out of view leave the tab order and stop painting.
        s.style.visibility = Math.abs(p) >= 0.999 ? "hidden" : "visible";
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
    update();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [flow]);

  // The lock: one gesture moves one screen. Browser snapping alone does not hold on a wheel (a large
  // delta skips screens and a small one bounces back), so wheel and keyboard are moved here while
  // touch keeps native snapping with scroll-snap-stop.
  const jump = useCallback(
    (target: number) => {
      const el = scroller.current;
      if (!el) return;
      const a = anim.current;
      const i = Math.max(0, Math.min(SUMMARY_SCREEN, target));
      if (flow) {
        el.querySelector(`.screen[data-screen="${i}"]`)?.scrollIntoView();
        return;
      }
      const to = i * screenHeight();
      const from = el.scrollTop;
      cancelAnimationFrame(a.raf);
      if (prefersReducedMotion() || from === to) {
        a.running = false;
        el.style.removeProperty("scroll-snap-type");
        el.scrollTop = to;
        return;
      }
      a.running = true;
      el.style.scrollSnapType = "none";
      const t0 = performance.now();
      const step = (now: number) => {
        const k = Math.min(1, (now - t0) / MOVE_MS);
        const e = k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2;
        el.scrollTop = from + (to - from) * e;
        if (k < 1) a.raf = requestAnimationFrame(step);
        else {
          el.style.removeProperty("scroll-snap-type");
          a.running = false;
        }
      };
      a.raf = requestAnimationFrame(step);
    },
    [flow],
  );

  useEffect(() => {
    const el = scroller.current;
    if (!el || flow) return;
    const a = anim.current;
    const current = () => Math.round(el.scrollTop / screenHeight());
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return; // browser zoom
      e.preventDefault();
      // A pause ends the gesture, so trackpad inertia cannot advance a second screen. The event's own
      // timestamp is used because a busy page delivers events late, which would look like pauses.
      if (e.timeStamp - a.lastWheel > GESTURE_GAP_MS) a.armed = true;
      a.lastWheel = e.timeStamp;
      if (a.running || !a.armed || Math.abs(e.deltaY) < 4) return;
      a.armed = false;
      jump(current() + Math.sign(e.deltaY));
    };
    const onKey = (e: KeyboardEvent) => {
      if (menuRef.current || e.ctrlKey || e.altKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.closest?.("select, input, textarea, .menu")) return;
      if (e.key === " " && target.closest?.("a, button")) return;
      if (e.key === "Home" || e.key === "End") {
        e.preventDefault();
        jump(e.key === "Home" ? 0 : SUMMARY_SCREEN);
        return;
      }
      const dir = ({ ArrowDown: 1, PageDown: 1, " ": e.shiftKey ? -1 : 1, ArrowUp: -1, PageUp: -1 } as Record<string, number>)[e.key];
      if (!dir) return;
      e.preventDefault();
      if (!a.running) jump(current() + dir);
    };
    // A finger takes over from any move in progress.
    const onTouch = () => {
      cancelAnimationFrame(a.raf);
      a.running = false;
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

  // Deep links and the back button.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const h = screenHeight();
    if (Math.round(el.scrollTop / h) === target.screen) return;
    if (flow) el.querySelector(`.screen[data-screen="${target.screen}"]`)?.scrollIntoView();
    else el.scrollTop = target.screen * h;
  }, [target, flow]);

  // Keep the address shareable without filling the back history.
  useEffect(() => {
    if (!flow && locked !== null) onScreen(locked);
  }, [flow, locked, onScreen]);

  const hitters = team.optimal.order.map((i) => team.hitters[i]);
  const announced =
    flow || locked === null ? "" : locked === SUMMARY_SCREEN ? t("sum.head") : `${ordinal(locked + 1, lang)}. ${hitters[locked].name}`;
  // Odd screens have the picture on the right, so the rail moves to the opposite edge.
  const railLeft = progress < SUMMARY_SCREEN ? progress % 2 === 1 : true;

  return (
    <>
      <div className={`scroller ${flow ? "flow" : ""}`} ref={scroller} tabIndex={0} role="region" aria-label={t("home.title", { team: team.name })}>
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
          />
        ))}
        <SummaryScreen data={data} team={team} on={flow || locked === SUMMARY_SCREEN} spinning={nearSummary} />
      </div>
      {!flow && (
        <nav className={`rail ${railLeft ? "left" : ""}`} aria-label={t("home.rail")}>
          {hitters.map((h, s) => (
            <button key={s} aria-current={progress === s ? "step" : undefined} aria-label={h.name} title={h.name} onClick={() => jump(s)}>
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
