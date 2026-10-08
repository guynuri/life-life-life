import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { blockColor, blocksFor, step, type Block, type Zoom } from "./moodMath";

export const MOOD_COLORS = ["#e76f51", "#f4a261", "#e9c46a", "#8ab17d", "#5fa8d3", "#9b8ec4"];

const ZOOMS: Zoom[] = ["day", "week", "month", "year"];
const COLUMNS: Record<Zoom, number> = { day: 7, week: 5, month: 4, year: 5 };
// Tapping a block zooms into the level below it.
const CHILD: Partial<Record<Zoom, Zoom>> = { year: "month", month: "week", week: "day" };

export function MoodView() {
  const [moods, setMoods] = useState<Map<string, string>>(new Map());
  const [zoom, setZoom] = useState<Zoom>("day");
  const [anchor, setAnchor] = useState(() => new Date());
  const [picking, setPicking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    supabase!
      .from("moods")
      .select("day,color")
      .then(({ data, error }) => {
        if (error) setError(error.message);
        else setMoods(new Map((data ?? []).map((r: { day: string; color: string }) => [r.day, r.color])));
      });
  }

  useEffect(load, []);

  // ponytail: reloads every mood row after each change; add a date range when rows grow.
  async function paint(day: string, color: string | null) {
    setPicking(null);
    const res = color
      ? await supabase!.from("moods").upsert({ day, color }, { onConflict: "user_id,day" })
      : await supabase!.from("moods").delete().eq("day", day);
    if (res.error) setError(res.error.message);
    load();
  }

  function tap(b: Block) {
    if (zoom === "day") return setPicking(b.key);
    setZoom(CHILD[zoom]!);
    setAnchor(b.start);
    setPicking(null);
  }

  function changeZoom(z: Zoom) {
    setZoom(z);
    setPicking(null);
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
      {picking && (
        <div className="mood-picker">
          <span>{picking}</span>
          {MOOD_COLORS.map((c) => (
            <button key={c} type="button" className="swatch" style={{ background: c }} aria-label={c} onClick={() => paint(picking, c)} />
          ))}
          <button type="button" onClick={() => paint(picking, null)}>
            Clear
          </button>
        </div>
      )}
    </section>
  );
}
