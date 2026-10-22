import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePinch } from "./hooks/usePinch";
import { loadMoods, saveMood } from "./lib/moodStore";
import {
  MOOD_COLORS,
  MOOD_COLOR_NAMES,
  blocksFor,
  dayLabel,
  parseDayKey,
  rangeOf,
  step,
  viewTitle,
  zoomIn,
  zoomOut,
  type MoodColor,
  type Rgb,
  type View,
  type Zoom,
} from "./lib/moodView";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

const rgbCss = (c: Rgb) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
// Supabase errors are plain objects, not Error instances, so read .message by shape.
const message = (e: unknown) => (typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e));

const ZOOMS: Zoom[] = ["day", "week", "month", "year"];
const ZOOM_LABELS: Record<Zoom, string> = { day: "Days", week: "Weeks", month: "Months", year: "Years" };

// Zooming changes the view inside a View Transition where the browser supports it, so the grid morphs instead of snapping.
// flushSync makes React commit the new grid before the browser takes the "after" snapshot.
function withTransition(update: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  if (doc.startViewTransition) doc.startViewTransition(() => flushSync(update));
  else update();
}

export function MoodScreen({ refreshTick }: { refreshTick: number }) {
  const now = new Date();
  const [view, setView] = useState<View>({ zoom: "day", year: now.getFullYear(), month: now.getMonth() });
  const [stored, setStored] = useState<Map<string, MoodColor>>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  const range = rangeOf(view);
  useEffect(() => {
    let live = true;
    loadMoods(range.from, range.to).then(
      (m) => {
        if (!live) return;
        setStored(m);
        setLoadError(null);
      },
      (e: unknown) => {
        if (!live) return;
        // Show nothing rather than colors we could not confirm.
        setStored(new Map());
        setLoadError(`Could not load moods: ${message(e)}`);
      },
    );
    return () => {
      live = false;
    };
  }, [range.from, range.to, refreshTick]);

  const colorOf = (day: string) => stored.get(day) ?? null;
  const blocks = blocksFor(view, colorOf);

  const go = (next: View) => withTransition(() => setView(next));

  usePinch(gridRef, (dir, x, y) => {
    if (dir === "in") {
      const next = zoomOut(view);
      if (next) go(next);
      return;
    }
    // Pinch out zooms into the block under the pinch midpoint.
    const key = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-key]")?.dataset.key;
    const next = key === undefined ? null : zoomIn(view, key);
    if (next) go(next);
  });

  async function choose(color: MoodColor | null) {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await saveMood(selected, color);
      setStored((prev) => {
        const next = new Map(prev);
        if (color) next.set(selected, color);
        else next.delete(selected);
        return next;
      });
      setSaveError(null);
    } catch (e) {
      setSaveError(`Could not save ${dayLabel(parseDayKey(selected))}: ${message(e)}`);
    } finally {
      setSaving(false);
    }
  }

  const leading = view.zoom === "day" ? new Date(view.year, view.month, 1).getDay() : 0;

  return (
    <section className="page">
      <header className="page-head row-between">
        <div>
          <h1 className="page-title">Mood</h1>
          <p className="page-sub">Pinch the grid to zoom in or out</p>
        </div>
        <div className="step-nav">
          <button type="button" className="icon-btn" aria-label="Previous" onClick={() => go(step(view, -1))}>
            <Icon name="chevronLeft" />
          </button>
          <span className="step-title">{viewTitle(view)}</span>
          <button type="button" className="icon-btn" aria-label="Next" onClick={() => go(step(view, 1))}>
            <Icon name="chevronRight" />
          </button>
        </div>
      </header>

      <div className="zoom-pills" role="radiogroup" aria-label="Zoom">
        {ZOOMS.map((z) => (
          <button
            key={z}
            type="button"
            role="radio"
            aria-checked={view.zoom === z}
            className="pill-btn"
            onClick={() => go({ ...view, zoom: z })}
          >
            {ZOOM_LABELS[z]}
          </button>
        ))}
      </div>

      {loadError && <p className="toast error" role="alert">{loadError}</p>}

      <div ref={gridRef} className={`mood-grid zoom-${view.zoom}`} role="group" aria-label={viewTitle(view)}>
        {Array.from({ length: leading }, (_, i) => (
          <div key={`pad-${i}`} className="cell pad" aria-hidden="true" />
        ))}
        {blocks.map((b) => (
          <button
            type="button"
            key={b.key}
            data-key={b.key}
            className="cell"
            style={b.color ? { background: rgbCss(b.color) } : undefined}
            aria-label={b.label}
            onClick={view.zoom === "day" ? () => setSelected(b.key) : () => go(zoomIn(view, b.key) ?? view)}
          >
            <span className="cell-label">{b.label}</span>
          </button>
        ))}
      </div>
      <p className="meta grid-hint">
        {view.zoom === "day" ? "Tap a day to pick its color." : "Tap a square to zoom in."}
      </p>

      {selected && (
        <Sheet title={dayLabel(parseDayKey(selected))} onClose={() => setSelected(null)}>
          <p className="meta">Saved: {stored.get(selected) ?? "blank"}</p>
          <div className="swatches">
            {MOOD_COLOR_NAMES.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                title={c}
                aria-pressed={stored.get(selected) === c}
                className="swatch"
                style={{ background: rgbCss(MOOD_COLORS[c]) }}
                disabled={saving}
                onClick={() => choose(c)}
              />
            ))}
          </div>
          {saveError && <p className="toast error" role="alert">{saveError}</p>}
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => choose(null)} disabled={saving}>
              Clear
            </button>
            <button type="button" className="btn primary" onClick={() => setSelected(null)} disabled={saving}>
              Done
            </button>
          </div>
        </Sheet>
      )}
      {!selected && saveError && <p className="toast error" role="alert">{saveError}</p>}
    </section>
  );
}
