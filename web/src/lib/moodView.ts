// Pure mood logic (SPEC 4). No DOM, no network. Dates are device-local.

export const MOOD_COLORS = {
  coral: [255, 138, 128],
  orange: [255, 183, 77],
  yellow: [255, 241, 118],
  green: [174, 213, 129],
  blue: [129, 212, 250],
  purple: [206, 147, 216],
} as const;

export type Rgb = readonly [number, number, number];
export type MoodColor = keyof typeof MOOD_COLORS;
export const MOOD_COLOR_NAMES = Object.keys(MOOD_COLORS) as MoodColor[];

export type Zoom = "day" | "week" | "month" | "year";
// year: the year viewed (the 10-year span ends with it). month: the month viewed (0-11).
export interface View {
  zoom: Zoom;
  year: number;
  month: number;
}
export interface Block {
  key: string;
  label: string;
  color: Rgb | null;
}
// Stored color for a day key ("YYYY-MM-DD"), or null when blank.
export type ColorOf = (day: string) => MoodColor | null;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
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

// Sunday-start weeks.
export function sundayOnOrBefore(d: Date): Date {
  return addDays(d, -d.getDay());
}

// Week number counted by the week's Thursday: week 1 is the first week whose Thursday is in January.
export function weekNumber(sunday: Date): number {
  const thursday = addDays(sunday, 4);
  const jan1 = Date.UTC(thursday.getFullYear(), 0, 1);
  const thu = Date.UTC(thursday.getFullYear(), thursday.getMonth(), thursday.getDate());
  const dayOfYear = Math.round((thu - jan1) / DAY_MS) + 1;
  return Math.floor((dayOfYear - 1) / 7) + 1;
}

// Sunday starts of every week touching the given month.
export function weeksTouching(year: number, month: number): Date[] {
  const last = new Date(year, month + 1, 0);
  const out: Date[] = [];
  for (let s = sundayOnOrBefore(new Date(year, month, 1)); s <= last; s = addDays(s, 7)) {
    out.push(s);
  }
  return out;
}

export function monthDays(year: number, month: number): Date[] {
  const n = new Date(year, month + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => new Date(year, month, i + 1));
}

// Channel-by-channel RGB average. Empty input has no average.
export function average(colors: readonly Rgb[]): Rgb | null {
  if (colors.length === 0) return null;
  const n = colors.length;
  const sum = colors.reduce<Rgb>((acc, c) => [acc[0] + c[0], acc[1] + c[1], acc[2] + c[2]], [0, 0, 0]);
  return [sum[0] / n, sum[1] / n, sum[2] / n];
}

const present = (xs: (Rgb | null)[]): Rgb[] => xs.filter((x): x is Rgb => x !== null);

function dayRgbs(dates: Date[], colorOf: ColorOf): Rgb[] {
  return dates.flatMap((d) => {
    const c = colorOf(dayKey(d));
    return c ? [MOOD_COLORS[c]] : [];
  });
}

// A week's color averages its seven days (blank days do not count).
export function weekColor(sunday: Date, colorOf: ColorOf): Rgb | null {
  const days = Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
  return average(dayRgbs(days, colorOf));
}

// A month averages the weeks touching it; a week touching two months counts toward both.
export function monthColor(year: number, month: number, colorOf: ColorOf): Rgb | null {
  return average(present(weeksTouching(year, month).map((s) => weekColor(s, colorOf))));
}

export function yearColor(year: number, colorOf: ColorOf): Rgb | null {
  return average(present(MONTH_NAMES.map((_, m) => monthColor(year, m, colorOf))));
}

export function blocksFor(view: View, colorOf: ColorOf): Block[] {
  switch (view.zoom) {
    case "day":
      return monthDays(view.year, view.month).map((d) => {
        const c = colorOf(dayKey(d));
        return { key: dayKey(d), label: String(d.getDate()), color: c ? MOOD_COLORS[c] : null };
      });
    case "week":
      return weeksTouching(view.year, view.month).map((s) => ({
        key: dayKey(s),
        label: `Week ${weekNumber(s)}`,
        color: weekColor(s, colorOf),
      }));
    case "month":
      return MONTH_NAMES.map((name, m) => ({
        key: String(m),
        label: name,
        color: monthColor(view.year, m, colorOf),
      }));
    case "year":
      return Array.from({ length: 10 }, (_, i) => view.year - 9 + i).map((y) => ({
        key: String(y),
        label: String(y),
        color: yearColor(y, colorOf),
      }));
  }
}

// Zoom in one level by tapping/pinching a block. Week drill-in keeps the viewed month,
// so a week in October shows October's days only.
export function zoomIn(view: View, key: string): View | null {
  switch (view.zoom) {
    case "year":
      return { zoom: "month", year: Number(key), month: view.month };
    case "month":
      return { zoom: "day", year: view.year, month: Number(key) };
    case "week":
      return { ...view, zoom: "day" };
    case "day":
      return null;
  }
}

const ZOOM_OUT: Record<Zoom, Zoom | null> = { day: "week", week: "month", month: "year", year: null };

export function zoomOut(view: View): View | null {
  const z = ZOOM_OUT[view.zoom];
  return z ? { ...view, zoom: z } : null;
}

// Previous/next: 1 month at day and week levels, 1 year at month level, 10 years at year level.
export function step(view: View, dir: 1 | -1): View {
  if (view.zoom === "month") return { ...view, year: view.year + dir };
  if (view.zoom === "year") return { ...view, year: view.year + 10 * dir };
  const m = new Date(view.year, view.month + dir, 1);
  return { ...view, year: m.getFullYear(), month: m.getMonth() };
}

// Stored day range (inclusive) that the view's colors depend on, padded for weeks at the edges.
export function rangeOf(view: View): { from: string; to: string } {
  const firstYear = view.zoom === "year" ? view.year - 9 : view.year;
  return {
    from: dayKey(sundayOnOrBefore(new Date(firstYear, 0, 1))),
    to: dayKey(addDays(new Date(view.year, 11, 31), 6)),
  };
}

export function viewTitle(view: View): string {
  if (view.zoom === "year") return `${view.year - 9}-${view.year}`;
  if (view.zoom === "month") return String(view.year);
  return `${MONTH_NAMES[view.month] ?? ""} ${view.year}`;
}

export function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}
