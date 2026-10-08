// Pure: no DOM, no network. Free slots come from the caller (Google free/busy later).
import { isWorkDay, placeAt, type Place } from "./conditions";

export type TaskKind = "big" | "work_day" | "scheduled_small";

export type SchedTask = {
  id: string;
  kind: TaskKind;
  durationMinutes: number;
  deadline: Date | null;
  place?: Place;
};

export type Slot = { start: Date; end: Date };
export type Placement = { taskId: string; start: Date; end: Date };
export type ScheduleResult = { placements: Placement[]; unplaced: string[] };

const MIN = 60_000;
const SESSION_MS = 60 * MIN; // ponytail: fixed 60-min big-task sessions, no per-task session length yet
const STEP_MS = 15 * MIN; // candidate start grid; coarser than minute-exact, fine for a personal planner

// Epoch milliseconds, half-open: [start, end).
type MsRange = { start: number; end: number };

export function schedule(tasks: SchedTask[], free: Slot[], now: Date): ScheduleResult {
  const nowMs = now.getTime();
  let open: MsRange[] = free
    .map((s) => ({ start: s.start.getTime(), end: s.end.getTime() }))
    .sort((a, b) => a.start - b.start);

  const placements: Placement[] = [];
  const unplaced: string[] = [];

  for (const task of [...tasks].sort(byDeadline)) {
    const lengths = task.kind === "big" ? splitSessions(task.durationMinutes * MIN) : [task.durationMinutes * MIN];
    const deadline = task.deadline?.getTime() ?? null;
    const usedDays = new Set<string>();
    let remaining = open;
    const found: MsRange[] = [];
    let ok = true;

    for (let i = 0; i < lengths.length; i++) {
      // Big tasks: session i wants to start in the i-th slice of the window from now to the deadline.
      // ponytail: no deadline = greedy from now, sessions cluster early; add a horizon once the spec says how far out to spread.
      const target = deadline === null ? nowMs : nowMs + (i * (deadline - nowMs)) / lengths.length;
      const start = findStart(remaining, task, lengths[i], Math.max(nowMs, target), usedDays);      if (start === null) {
        ok = false;
        break;
      }
      usedDays.add(localDay(start));
      found.push({ start, end: start + lengths[i] });
      remaining = subtract(remaining, start, start + lengths[i]);
    }

    if (!ok) {
      unplaced.push(task.id);
      continue;
    }
    open = remaining;
    for (const r of found) {
      placements.push({ taskId: task.id, start: new Date(r.start), end: new Date(r.end) });
    }
  }

  placements.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { placements, unplaced };
}

// Earliest deadline first; tasks without a deadline go last.
function byDeadline(a: SchedTask, b: SchedTask): number {
  if (a.deadline === null) return b.deadline === null ? 0 : 1;
  if (b.deadline === null) return -1;
  return a.deadline.getTime() - b.deadline.getTime();
}

function splitSessions(totalMs: number): number[] {
  const out: number[] = [];
  for (let left = totalMs; left > 0; left -= SESSION_MS) out.push(Math.min(SESSION_MS, left));
  return out;
}

function findStart(
  open: MsRange[],
  task: SchedTask,
  len: number,
  earliest: number,
  usedDays: Set<string>,
): number | null {
  const deadline = task.deadline?.getTime() ?? Infinity;
  for (const slot of open) {
    const last = Math.min(slot.end, deadline);
    for (let t = Math.ceil(Math.max(slot.start, earliest) / STEP_MS) * STEP_MS; t + len <= last; t += STEP_MS) {
      if (!usedDays.has(localDay(t)) && fits(t, len, task)) return t;
    }
  }
  return null;
}

// Checks every minute, so a block that straddles 09:00 or 19:00 is caught.
function fits(start: number, len: number, task: SchedTask): boolean {
  for (let t = start; t < start + len; t += MIN) {
    const at = new Date(t);
    if (task.kind === "work_day" && !isWorkDay(at)) return false;
    if (task.place && placeAt(at) !== task.place) return false;
  }
  return true;
}

function subtract(open: MsRange[], start: number, end: number): MsRange[] {
  return open.flatMap((r) => {
    if (end <= r.start || start >= r.end) return [r];
    const left = r.start < start ? [{ start: r.start, end: start }] : [];
    const right = end < r.end ? [{ start: end, end: r.end }] : [];
    return [...left, ...right];
  });
}

// Local calendar day as YYYY-MM-DD, used to keep big-task sessions on different days.
function localDay(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
