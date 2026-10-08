import { useEffect, useRef, useState } from "react";
import { supabase } from "../../lib/supabase";
import { blockColor, blocksFor, step, type Block, type Zoom } from "./moodMath";

const MOOD_COLORS = [
  { name: "coral", hex: "#e76f51" },
  { name: "orange", hex: "#f4a261" },
  { name: "yellow", hex: "#e9c46a" },
  { name: "green", hex: "#8ab17d" },
  { name: "blue", hex: "#5fa8d3" },
  { name: "purple", hex: "#9b8ec4" },
];

const ZOOMS: Zoom[] = ["day", "week", "month", "year"];
const COLUMNS: Record<Zoom, number> = { day: 7, week: 5, month: 4, year: 5 };
// Tapping a block zooms into the level below it.
const CHILD: Partial<Record<Zoom, Zoom>> = { year: "month", month: "week", week: "day" };

// "2026-10-09" -> "Fri, Oct 9". Built from parts so it stays on the local date.
function formatDay(key: string) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en", { weekday: "short", month: "short", day: "numeric" });
}

export function MoodView() {
  const [moods, setMoods] = useState<Map<string, string>>(new Map());
  const [zoom, setZoom] = useState<Zoom>("day");
  const [anchor, setAnchor] = useState(() => new Date());
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Writes run one at a time so quick taps apply in order.
  const writes = useRef<Promise<void>>(Promise.resolve());

  async function load() {
    const { data, error } = await supabase!.from("moods").select("day,color");
    if (error) return setError(error.message);
    setError(null);
    setMoods(new Map((data ?? []).map((r: { day: string; color: string }) => [r.day, r.color])));
  }

  useEffect(() => {
    load();
  }, []);

  // ponytail: a failed write reloads every mood row; add a date range when rows grow.
  function setMood(day: string, color: string | null) {
    setPickedDay(null);
    writes.current = writes.current.then(async () => {
      try {
        const res = color
          ? await supabase!.from("moods").upsert({ day, color }, { onConflict: "user_id,day" })
          : await supabase!.from("moods").delete().eq("day", day);
        if (res.error) {
          setError(res.error.message);
          return load();
        }
        setError(null);
        setMoods((m) => {
          const next = new Map(m);
          if (color) next.set(day, color);
          else next.delete(day);
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  function tap(b: Block) {
    if (zoom === "day") return setPickedDay(b.key);
    // A week can start in the previous month; open the current month's part of it.
    const monthStart = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    setZoom(CHILD[zoom]!);
    setAnchor(zoom === "week" && b.start < monthStart ? monthStart : b.start);
    setPickedDay(null);
  }

  function changeZoom(z: Zoom) {
    setZoom(z);
    setPickedDay(null);
  }

  const y = anchor.getFullYear();
  const title =
    zoom === "month" ? String(y) : zoom === "year" ? `${y - 9}–${y}` : anchor.toLocaleString("en", { month: "long", year: "numeric" });

  return (
    <section className="mood">
      <nav className="mood-nav">
        <button type="button" onClick={() => setAnchor(step(zoom, anchor, -1))} aria-label="Previous">
          ‹
        </button>
        <strong>{title}</strong>
        <button type="button" onClick={() => setAnchor(step(zoom, anchor, 1))} aria-label="Next">
          ›
        </button>
      </nav>
      <div className="mood-zooms">
        {ZOOMS.map((z) => (
          <button key={z} type="button" aria-pressed={z === zoom} onClick={() => changeZoom(z)}>
            {z}
          </button>
        ))}
      </div>
      {error && <p className="status">{error}</p>}
      <div className="mood-grid" style={{ gridTemplateColumns: `repeat(${COLUMNS[zoom]}, 1fr)` }}>
        {blocksFor(zoom, anchor).map((b) => {
          const color = blockColor(b, moods);
          return (
            <button
              key={b.key}
              type="button"
              className={color ? "mood-cell" : "mood-cell empty"}
              style={color ? { background: color } : undefined}
              onClick={() => tap(b)}
              aria-label={b.label}
            >
              {b.label}
            </button>
          );
        })}
      </div>
      {pickedDay && (
        <div className="mood-picker">
          <span>{formatDay(pickedDay)}</span>
          {MOOD_COLORS.map((c) => (
            <button
              key={c.hex}
              type="button"
              className="swatch"
              style={{ background: c.hex }}
              aria-label={c.name}
              onClick={() => setMood(pickedDay, c.hex)}
            />
          ))}
          <button type="button" onClick={() => setMood(pickedDay, null)}>
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
