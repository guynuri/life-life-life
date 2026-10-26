import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePinch } from "./hooks/usePinch";
import { loadMoods, saveMood } from "./lib/moodStore";
import {
  DEFAULT_SIZE,
  EMOTIONS,
  EMOTION_NAMES,
  anchoredScrollTop,
  clampSize,
  dayKey,
  dayLabel,
  daysLeft,
  gridCells,
  gridEnd,
  gridStart,
  parseDayKey,
  rowHeight,
  visibleRows,
  type Emotion,
  type MoodEntry,
  type Moods,
  type Rgb,
} from "./lib/moodView";
import { Sheet } from "./Sheet";

const rgbCss = (c: Rgb) => `rgb(${c.join(", ")})`;
// Supabase errors are plain objects, not Error instances, so read .message by shape.
const message = (e: unknown) => (typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e));

// Below this box size the date numbers would be unreadable, so they are hidden.
const LABEL_MIN_SIZE = 18;

// Rows rendered above and below the viewport, so a fast scroll does not show blank space.
const BUFFER_ROWS = 10;

type Cell = { key: string; day: number } | null;

// Virtual list: only rows start..end are rendered. Spacers stand in for the rest, sized from the --cell variable
// on the scroller, so the grid does not need the box size as a prop. Memoized, so a pinch that only changes
// --cell does not re-render the rows.
const DayGrid = memo(function DayGrid({
  cells,
  todayKey,
  stored,
  onOpen,
  start,
  end,
}: {
  cells: Cell[];
  todayKey: string;
  stored: Moods;
  onOpen: (key: string) => void;
  start: number;
  end: number;
}) {
  const rows: ReactNode[] = [];
  for (let r = start; r <= end; r++) {
    rows.push(
      <div key={r} className="mood-row">
        {cells.slice(r * 7, r * 7 + 7).map((cell, i) => {
          if (cell === null) return <div key={`pad-${i}`} className="cell pad" aria-hidden="true" />;
          const entry = stored.get(cell.key);
          const classes = `cell${cell.key === todayKey ? " today" : ""}`;
          return (
            <button
              type="button"
              key={cell.key}
              data-key={cell.key}
              className={classes}
              style={entry ? { background: rgbCss(EMOTIONS[entry.emotion]) } : undefined}
              aria-label={entry ? `${cell.key}, ${entry.emotion}` : cell.key}
              onClick={() => onOpen(cell.key)}
            >
              <span className="cell-label">{cell.day}</span>
            </button>
          );
        })}
      </div>,
    );
  }
  // Each row is its box size plus the 3px row margin.
  const rowsAbove = `calc((var(--cell) + 3px) * ${start})`;
  const rowsBelow = `calc((var(--cell) + 3px) * ${cells.length / 7 - end - 1})`;
  return (
    <div className="mood-grid">
      <div style={{ height: rowsAbove }} aria-hidden="true" />
      {rows}
      <div style={{ height: rowsBelow }} aria-hidden="true" />
    </div>
  );
});

export function MoodScreen({ refreshTick }: { refreshTick: number }) {
  // The range is fixed when the screen mounts: two months back through 65 years ahead.
  const [range] = useState(() => {
    const today = new Date();
    const start = gridStart(today);
    const end = gridEnd(today);
    const cells = gridCells(start, end).map((key) => (key === null ? null : { key, day: Number(key.slice(8)) }));
    return { todayKey: dayKey(today), start, end, cells, left: daysLeft(today, end) };
  });
  const [size, setSize] = useState(DEFAULT_SIZE);
  const sizeRef = useRef(size);
  const baseSize = useRef(size);
  const pendingScroll = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [win, setWin] = useState({ start: 0, end: -1 });

  // Recomputes the rendered rows from the scroll position. Only sets state when the window moves to other rows.
  const syncWindow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = visibleRows(el.scrollTop, el.clientHeight, sizeRef.current, range.cells.length / 7, BUFFER_ROWS);
    setWin((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, [range]);

  const [stored, setStored] = useState<Moods>(new Map());
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    loadMoods(dayKey(range.start), dayKey(range.end)).then(
      (m) => {
        if (!live) return;
        setStored(m);
        setLoadError(null);
      },
      (e: unknown) => {
        if (!live) return;
        // Show nothing rather than entries we could not confirm.
        setStored(new Map());
        setLoadError(`Could not load moods: ${message(e)}`);
      },
    );
    return () => {
      live = false;
    };
  }, [range, refreshTick]);

  // Open the grid on today, centered.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const index = range.cells.findIndex((c) => c?.key === range.todayKey);
    if (!el || index < 0) return;
    const row = Math.floor(index / 7);
    el.scrollTop = row * rowHeight(sizeRef.current) - el.clientHeight / 2 + rowHeight(sizeRef.current) / 2;
  }, [range]);

  // Pinch sets the box size from the size at gesture start, and keeps the row under the fingers in place.
  // The scroll is applied after React commits the new size, because the content height changes with it.
  // A rotation or the iOS toolbar changes the scroller's height (100dvh), so the window is recomputed on resize too.
  useEffect(() => {
    window.addEventListener("resize", syncWindow);
    return () => window.removeEventListener("resize", syncWindow);
  }, [syncWindow]);

  // Runs on mount too, after the open-on-today effect above, so the first window matches the scroll position.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && pendingScroll.current !== null) {
      el.scrollTop = pendingScroll.current;
      pendingScroll.current = null;
    }
    syncWindow();
  }, [size, syncWindow]);

  usePinch(scrollRef, {
    onStart: () => {
      baseSize.current = sizeRef.current;
    },
    onScale: (ratio, _x, y) => {
      const el = scrollRef.current;
      if (!el) return;
      const old = sizeRef.current;
      const next = clampSize(baseSize.current * ratio);
      if (next === old) return;
      const pointerY = y - el.getBoundingClientRect().top;
      pendingScroll.current = anchoredScrollTop(el.scrollTop, pointerY, old, next);
      sizeRef.current = next;
      setSize(next);
    },
  });

  const open = useCallback((key: string) => {
    setSelected(key);
    setSaveError(null);
  }, []);

  // The note box starts from the stored note each time a day opens.
  useEffect(() => {
    setDraft(selected ? (stored.get(selected)?.note ?? "") : "");
  }, [selected]);

  async function save(entry: MoodEntry | null) {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await saveMood(selected, entry);
      setStored((prev) => {
        const next = new Map(prev);
        if (entry) next.set(selected, entry);
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

  const note = draft.trim() || null;
  const current = selected ? stored.get(selected) : undefined;

  return (
    <section className="page">
      <header className="page-head row-between">
        <div>
          <h1 className="page-title">Mood</h1>
          <p className="page-sub">Pinch to zoom. Tap a day to log it.</p>
        </div>
        <p className="days-left">
          <span className="days-left-num">{range.left.toLocaleString("en-US")}</span> days left
          <span className="meta"> until {range.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        </p>
      </header>

      {loadError && <p className="toast error" role="alert">{loadError}</p>}

      <div
        ref={scrollRef}
        className={`mood-scroll${size < LABEL_MIN_SIZE ? " tiny" : ""}`}
        style={{ "--cell": `${size}px` } as CSSProperties}
        onScroll={syncWindow}
      >
        <DayGrid cells={range.cells} todayKey={range.todayKey} stored={stored} onOpen={open} start={win.start} end={win.end} />
      </div>

      {selected && (
        <Sheet title={dayLabel(parseDayKey(selected))} onClose={() => setSelected(null)}>
          <p className="meta">Saved: {current ? current.emotion : "blank"}</p>
          <div className="emotions">
            {EMOTION_NAMES.map((e: Emotion) => (
              <button
                type="button"
                key={e}
                aria-label={e}
                aria-pressed={current?.emotion === e}
                className="emotion-chip"
                style={{ background: rgbCss(EMOTIONS[e]) }}
                disabled={saving}
                onClick={() => save({ emotion: e, note })}
              >
                {e}
              </button>
            ))}
          </div>
          <label className="note-field">
            <span className="meta">What happened</span>
            <textarea
              value={draft}
              rows={3}
              maxLength={500}
              placeholder="Talked with a lot of people, too many things at once…"
              onChange={(ev) => setDraft(ev.target.value)}
              disabled={saving}
            />
          </label>
          {saveError && <p className="toast error" role="alert">{saveError}</p>}
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={() => save(null)} disabled={saving || !current}>
              Clear
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => (current ? save({ emotion: current.emotion, note }) : undefined)}
              disabled={saving || !current}
            >
              Save note
            </button>
          </div>
        </Sheet>
      )}
      {!selected && saveError && <p className="toast error" role="alert">{saveError}</p>}
    </section>
  );
}
