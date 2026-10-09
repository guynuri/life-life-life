import { useEffect, useRef, useState } from "react";
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
} from "./lib/moodView";

const rgbCss = (c: Rgb) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
// Supabase errors are plain objects, not Error instances, so read .message by shape.
const message = (e: unknown) => (typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e));

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

  usePinch(gridRef, (dir, x, y) => {
    if (dir === "in") {
      const next = zoomOut(view);
      if (next) setView(next);
      return;
    }
    // Pinch out zooms into the block under the pinch midpoint.
    const key = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-key]")?.dataset.key;
    const next = key === undefined ? null : zoomIn(view, key);
    if (next) setView(next);
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
    <section className="mood">
      <h2>Mood</h2>
      <nav className="mood-nav">
        <button type="button" onClick={() => setView(step(view, -1))}>
          Prev
        </button>
        <span>{viewTitle(view)}</span>
        <button type="button" onClick={() => setView(step(view, 1))}>
          Next
        </button>
      </nav>
      {loadError && <p className="error" role="alert">{loadError}</p>}
      <div ref={gridRef} className={`mood-grid zoom-${view.zoom}`}>
        {Array.from({ length: leading }, (_, i) => (
          <div key={`pad-${i}`} className="block pad" />
        ))}
        {blocks.map((b) => (
          <button
            type="button"
            key={b.key}
            data-key={b.key}
            className="block"
            style={b.color ? { background: rgbCss(b.color) } : undefined}
            onClick={view.zoom === "day" ? () => setSelected(b.key) : undefined}
          >
            {b.label}
          </button>
        ))}
      </div>
      {selected && (
        <div className="picker" role="dialog" aria-label="Choose mood">
          <h3>{dayLabel(parseDayKey(selected))}</h3>
          <p className="muted">Saved: {stored.get(selected) ?? "blank"}</p>
          <div className="swatches">
            {MOOD_COLOR_NAMES.map((c) => (
              <button
                type="button"
                key={c}
                aria-label={c}
                title={c}
                className="swatch"
                style={{ background: rgbCss(MOOD_COLORS[c]) }}
                disabled={saving}
                onClick={() => choose(c)}
              />
            ))}
          </div>
          <div className="picker-actions">
            <button type="button" onClick={() => choose(null)} disabled={saving}>
              Clear
            </button>
            <button type="button" onClick={() => setSelected(null)} disabled={saving}>
              Done
            </button>
          </div>
        </div>
      )}
      {saveError && <p className="error" role="alert">{saveError}</p>}
    </section>
  );
}
