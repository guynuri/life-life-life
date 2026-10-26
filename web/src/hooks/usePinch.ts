import { useEffect, useRef, type RefObject } from "react";

// Reports a two-finger gesture continuously. ratio is the current finger distance over the distance when the
// gesture started (above 1 means fingers apart). x and y are the midpoint in client pixels.
export interface PinchHandlers {
  onStart: () => void;
  onScale: (ratio: number, x: number, y: number) => void;
}

export function usePinch(ref: RefObject<HTMLElement>, handlers: PinchHandlers) {
  const latest = useRef(handlers);
  latest.current = handlers;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let startDist = 0;

    const points = (list: TouchList) => {
      const a = list.item(0);
      const b = list.item(1);
      return a && b ? { a, b } : null;
    };

    const onStart = (e: TouchEvent) => {
      const p = points(e.touches);
      if (!p) return;
      startDist = Math.hypot(p.a.clientX - p.b.clientX, p.a.clientY - p.b.clientY);
      if (startDist > 0) latest.current.onStart();
    };

    const onMove = (e: TouchEvent) => {
      const p = points(e.touches);
      if (!p || startDist === 0) return;
      const ratio = Math.hypot(p.a.clientX - p.b.clientX, p.a.clientY - p.b.clientY) / startDist;
      latest.current.onScale(ratio, (p.a.clientX + p.b.clientX) / 2, (p.a.clientY + p.b.clientY) / 2);
    };

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) startDist = 0;
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
