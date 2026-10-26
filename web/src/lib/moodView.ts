// Pure mood logic (SPEC 4). No DOM, no network. Dates are device-local.

export const EMOTIONS = {
  happy: [255, 213, 79],
  excited: [255, 167, 38],
  proud: [186, 104, 200],
  calm: [129, 212, 250],
  tired: [144, 164, 174],
  anxious: [128, 203, 196],
  annoyed: [255, 138, 128],
  sad: [121, 134, 203],
} as const;

export type Rgb = readonly [number, number, number];
export type Emotion = keyof typeof EMOTIONS;
export const EMOTION_NAMES = Object.keys(EMOTIONS) as Emotion[];

// One stored row per day. A day with no row is blank.
export interface MoodEntry {
  emotion: Emotion;
  note: string | null;
}
export type Moods = Map<string, MoodEntry>;

export const GRID_YEARS_AHEAD = 65;
export const GRID_MONTHS_BACK = 2;

const DAY_MS = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// Sunday-start weeks, as the spec has them.
export function sundayOnOrBefore(d: Date): Date {
  return addDays(d, -d.getDay());
}

// Two months back, keeping the day of the month (clamped, so Mar 31 becomes Jan 31 and May 31 becomes Mar 31).
export function gridStart(today: Date): Date {
  const first = new Date(today.getFullYear(), today.getMonth() - GRID_MONTHS_BACK, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return new Date(first.getFullYear(), first.getMonth(), Math.min(today.getDate(), last));
}

export function gridEnd(today: Date): Date {
  return new Date(today.getFullYear() + GRID_YEARS_AHEAD, today.getMonth(), today.getDate());
}

export function daysLeft(today: Date, end: Date): number {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(end) - utc(today)) / DAY_MS);
}

// Flat list of day keys in Sunday-start rows of 7, from the week of `start` through `end`.
// Null marks a cell outside [start, end] (leading or trailing in the first and last rows).
export function gridCells(start: Date, end: Date): (string | null)[] {
  const from = dayKey(start);
  const to = dayKey(end);
  const out: (string | null)[] = [];
  for (let d = sundayOnOrBefore(start); d <= end || out.length % 7 !== 0; d = addDays(d, 1)) {
    const key = dayKey(d);
    out.push(key >= from && key <= to ? key : null);
  }
  return out;
}

// Box sizes in px. The gap is fixed so row height is size plus the gap.
export const MIN_SIZE = 6;
export const MAX_SIZE = 56;
export const DEFAULT_SIZE = 36;
const GAP = 3;
export const rowHeight = (size: number) => size + GAP;

// After a pinch changes the box size, keep the row under the fingers at the same spot on screen.
// scrollTop and pointerY are both relative to the scroll container.
export function anchoredScrollTop(scrollTop: number, pointerY: number, oldSize: number, newSize: number): number {
  const row = (scrollTop + pointerY) / rowHeight(oldSize);
  return row * rowHeight(newSize) - pointerY;
}

export function clampSize(size: number): number {
  return Math.min(MAX_SIZE, Math.max(MIN_SIZE, Math.round(size)));
}

// Rows to render for the viewport (inclusive indices), plus a buffer above and below so a fast scroll does not show gaps.
export function visibleRows(scrollTop: number, viewHeight: number, size: number, totalRows: number, buffer: number): { start: number; end: number } {
  const h = rowHeight(size);
  return {
    start: Math.max(0, Math.floor(scrollTop / h) - buffer),
    end: Math.min(totalRows - 1, Math.floor((scrollTop + viewHeight) / h) + buffer),
  };
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
