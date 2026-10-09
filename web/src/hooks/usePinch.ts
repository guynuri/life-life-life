import { useEffect, useRef, type RefObject } from "react";

export type PinchDir = "out" | "in";

// Fires once per gesture when the distance between two touches changes past the threshold.
// Pinch out (fingers apart) is "out"; pinch in (fingers together) is "in".
const OUT_RATIO = 1.25;
const IN_RATIO = 0.8;

export function usePinch(ref: RefObject<HTMLElement>, onPinch: (dir: PinchDir, x: number, y: number) => void) {
  const handler = useRef(onPinch);
  handler.current = onPinch;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startDist = 0;
    let fired = false;

    const points = (list: TouchList) => {
      const a = list.item(0);
      const b = list.item(1);
      return a && b ? { a, b } : null;
    };

    const onStart = (e: TouchEvent) => {
      const p = points(e.touches);
      if (!p) return;
      startDist = Math.hypot(p.a.clientX - p.b.clientX, p.a.clientY - p.b.clientY);
      fired = false;
    };

    const onMove = (e: TouchEvent) => {
      const p = points(e.touches);
      if (!p || fired || startDist === 0) return;
      const ratio = Math.hypot(p.a.clientX - p.b.clientX, p.a.clientY - p.b.clientY) / startDist;
      const dir: PinchDir | null = ratio >= OUT_RATIO ? "out" : ratio <= IN_RATIO ? "in" : null;
      if (!dir) return;
      fired = true;
      handler.current(dir, (p.a.clientX + p.b.clientX) / 2, (p.a.clientY + p.b.clientY) / 2);
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        startDist = 0;
        fired = false;
      }
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [ref]);
}
