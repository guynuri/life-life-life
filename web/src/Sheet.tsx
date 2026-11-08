import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

// Bottom sheet for add and edit forms. Closes on Escape, the close button, or a tap on the backdrop.
// Focus moves into the sheet when it opens and goes back to the trigger when it closes.
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const sheetRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const first =
      sheetRef.current?.querySelector<HTMLElement>("input, select, textarea") ?? sheetRef.current?.querySelector<HTMLElement>("button");
    first?.focus();
    return () => returnTo?.focus();
  }, []);

  // iOS: the keyboard shrinks the visual viewport and pans it, but a fixed element stays in the layout viewport.
  // The sheet is drawn higher than where it takes taps. Pinning the backdrop to the visual viewport keeps both in one place.
  useEffect(() => {
    const vv = window.visualViewport;
    const backdrop = backdropRef.current;
    if (!vv || !backdrop) return;
    const fit = () => {
      backdrop.style.top = `${vv.offsetTop}px`;
      backdrop.style.height = `${vv.height}px`;
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div ref={backdropRef} className="sheet-backdrop" onClick={onClose}>
      <section
        ref={sheetRef}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-grip" aria-hidden="true" />
        <header className="sheet-head">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
