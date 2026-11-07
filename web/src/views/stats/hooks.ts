import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import { useMedia } from "../../home/format";
import { useI18n } from "../../i18n-context";

export function useWidth(fallback = 320): [RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(el.clientWidth || fallback); // eslint-disable-line react/set-state-in-effect -- measured before the first paint
    const ro = new ResizeObserver((entries) => {
      const cw = Math.round(entries[0].contentRect.width);
      if (cw > 0) setW(cw);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w];
}

/** True once the element has come near the viewport. It never turns back. */
export function useSeen<T extends Element>(margin = "0px"): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setSeen(true);
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen, margin]);
  return [ref, seen];
}

/** The sticky storytelling only runs when there is room for it and motion is welcome. */
export function useStoryMode(): boolean {
  const wide = useMedia("(min-width: 1040px) and (min-height: 640px)");
  const still = useMedia("(prefers-reduced-motion: reduce)");
  return wide && !still;
}

/** A re-estimate count cannot prove certainty, so it never reads as 100%. */
export function useCertainty() {
  const { t, pct } = useI18n();
  return (p: number) => (p > 0.99 ? t("cap.more", { n: pct(0.99) }) : p < 0.01 ? t("cap.less", { n: pct(0.01) }) : pct(p, 1));
}
