export type Zoom = "day" | "week" | "month" | "year";

export type Block = { key: string; label: string; start: Date; end: Date };

// The level one step finer than each zoom. Tapping a block zooms into it.
export const CHILD_ZOOM: Partial<Record<Zoom, Zoom>> = { year: "month", month: "week", week: "day" };

// Local calendar day as YYYY-MM-DD. Not toISOString, which is UTC and shifts the day.
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

// Week number in its year. Weeks are Sunday-start and judged by their Thursday, so the week
// containing Jan 1 is 1. A year with a 53rd partial week (2026 ends with one) shows 53.
export function weekNumber(start: Date): number {
  const thu = addDays(start, 4);
  const days = Math.round((thu.getTime() - new Date(thu.getFullYear(), 0, 1).getTime()) / 86400000);
  return Math.floor(days / 7) + 1;
}

// Blocks for one zoom level around an anchor date.
// day: every day of the anchor's month. week: Sunday-start weeks touching that month.
// month: 12 months of the anchor's year. year: 10 years ending at the anchor's year.
export function blocksFor(zoom: Zoom, anchor: Date): Block[] {
  const y = anchor.getFullYear();
  const m = anchor.getMonth();
  const blocks: Block[] = [];
  if (zoom === "day") {
    for (let d = 1; d <= new Date(y, m + 1, 0).getDate(); d++) {
      const start = new Date(y, m, d);
      blocks.push({ key: dayKey(start), label: String(d), start, end: addDays(start, 1) });
    }
  } else if (zoom === "week") {
    const monthEnd = new Date(y, m + 1, 1);
    for (let start = addDays(new Date(y, m, 1), -new Date(y, m, 1).getDay()); start < monthEnd; start = addDays(start, 7)) {
      blocks.push({ key: dayKey(start), label: String(weekNumber(start)), start, end: addDays(start, 7) });
    }
  } else if (zoom === "month") {
    for (let i = 0; i < 12; i++) {
      const start = new Date(y, i, 1);
      blocks.push({ key: dayKey(start), label: start.toLocaleString("en", { month: "short" }), start, end: new Date(y, i + 1, 1) });
    }
  } else {
    for (let yr = y - 9; yr <= y; yr++) {
      blocks.push({ key: String(yr), label: String(yr), start: new Date(yr, 0, 1), end: new Date(yr + 1, 0, 1) });
    }
  }
  return blocks;
}

// The finer blocks that make up b: months of a year, weeks touching a month, days of a week.
function childrenOf(b: Block, zoom: Zoom): Block[] {
  if (zoom === "year") return blocksFor("month", b.start);
  if (zoom === "month") return blocksFor("week", b.start);
  const days: Block[] = [];
  for (let d = b.start; d < b.end; d = addDays(d, 1)) {
    days.push({ key: dayKey(d), label: String(d.getDate()), start: d, end: addDays(d, 1) });
  }
  return days;
}

// Channel-wise mean of #rrggbb colors. Null when there are none.
export function averageColors(colors: string[]): string | null {
  if (colors.length === 0) return null;
  const sum = [0, 0, 0];
  for (const c of colors) {
    for (let i = 0; i < 3; i++) sum[i] += parseInt(c.slice(1 + 2 * i, 3 + 2 * i), 16);
  }
  return "#" + sum.map((s) => Math.round(s / colors.length).toString(16).padStart(2, "0")).join("");
}

// Color of a block at the given zoom level. A day is its own mood; any coarser block is the
// average of its children's colors. Days outside the parent still count, so a week that
// straddles two months contributes to both.
// ponytail: recomputes every child on each render; memoize if a year view lags.
export function colorOf(b: Block, zoom: Zoom, moods: Map<string, string>): string | null {
  if (zoom === "day") return moods.get(b.key) ?? null;
  const child = CHILD_ZOOM[zoom]!;
  const colors = childrenOf(b, zoom)
    .map((c) => colorOf(c, child, moods))
    .filter((c): c is string => c !== null);
  return averageColors(colors);
}

// Move the anchor one unit of the zoom: a month for day/week, a year for month, ten years for year.
export function step(zoom: Zoom, anchor: Date, dir: 1 | -1): Date {
  const y = anchor.getFullYear();
  if (zoom === "month") return new Date(y + dir, 0, 1);
  if (zoom === "year") return new Date(y + 10 * dir, 0, 1);
  return new Date(y, anchor.getMonth() + dir, 1);
}
