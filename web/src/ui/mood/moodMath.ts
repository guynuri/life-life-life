export type Zoom = "day" | "week" | "month" | "year";

export type Block = { key: string; label: string; start: Date; end: Date };

// Local calendar day as YYYY-MM-DD. Not toISOString, which is UTC and shifts the day.
export function dayKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

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
      blocks.push({ key: dayKey(start), label: String(start.getDate()), start, end: addDays(start, 7) });
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

// Most common color; a tie goes to whichever color reached the top count first. Null if empty.
export function summarize(colors: string[]): string | null {
  const counts = new Map<string, number>();
  let best: string | null = null;
  let bestCount = 0;
  for (const c of colors) {
    const n = (counts.get(c) ?? 0) + 1;
    counts.set(c, n);
    if (n > bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}

// One color for a block: summarize the colors of the set days inside it.
// ponytail: scans every day per block per render; fine for one user, memoize if it lags.
export function blockColor(b: Block, moods: Map<string, string>): string | null {
  const colors: string[] = [];
  for (let d = b.start; d < b.end; d = addDays(d, 1)) {
    const c = moods.get(dayKey(d));
    if (c) colors.push(c);
  }
  return summarize(colors);
}

// Move the anchor one unit of the zoom: a month for day/week, a year for month, ten years for year.
export function step(zoom: Zoom, anchor: Date, dir: 1 | -1): Date {
  const y = anchor.getFullYear();
  if (zoom === "month") return new Date(y + dir, 0, 1);
  if (zoom === "year") return new Date(y + 10 * dir, 0, 1);
  return new Date(y, anchor.getMonth() + dir, 1);
}
