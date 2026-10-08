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

type Range = { start: number; end: number };

export function schedule(tasks: SchedTask[], free: Slot[], now: Date): ScheduleResult {
  const nowMs = now.getTime();
  let open: Range[] = free
    .map((s) => ({ start: s.start.getTime(), end: s.end.getTime() }))
    .sort((a, b) => a.start - b.start);

  // Earliest deadline first; tasks without a deadline go last.
  const order = [...tasks].sort(
    (a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity),
  );

  const placements: Placement[] = [];
  const unplaced: string[] = [];

  for (const task of order) {
    const sessions = task.kind === "big" ? splitSessions(task.durationMinutes * MIN) : [task.durationMinutes * MIN];
    const usedDays = new Set<string>();
    let trial = open;
    const found: Range[] = [];
    let ok = true;

    for (const len of sessions) {
      const start = findStart(trial, task, len, nowMs, usedDays);
      if (start === null) {
        ok = false;
        break;
      }
      usedDays.add(dayKey(start));
      found.push({ start, end: start + len });
      trial = take(trial, start, start + len);
    }

    if (!ok) {
      unplaced.push(task.id);
      continue;
    }
    open = trial;
    for (const r of found) {
      placements.push({ taskId: task.id, start: new Date(r.start), end: new Date(r.end) });
    }
  }

  placements.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { placements, unplaced };
}

function splitSessions(totalMs: number): number[] {
  const out: number[] = [];
  for (let left = totalMs; left > 0; left -= SESSION_MS) out.push(Math.min(SESSION_MS, left));
  return out;
}

function findStart(open: Range[], task: SchedTask, len: number, nowMs: number, usedDays: Set<string>): number | null {
  const deadline = task.deadline?.getTime() ?? Infinity;
  for (const slot of open) {
    const last = Math.min(slot.end, deadline);
    for (let t = Math.ceil(Math.max(slot.start, nowMs) / STEP_MS) * STEP_MS; t + len <= last; t += STEP_MS) {
      if (!usedDays.has(dayKey(t)) && fits(t, len, task)) return t;
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

function take(open: Range[], start: number, end: number): Range[] {
  return open.flatMap((r) => {
    if (end <= r.start || start >= r.end) return [r];
    const left = r.start < start ? [{ start: r.start, end: start }] : [];
    const right = end < r.end ? [{ start: end, end: r.end }] : [];
    return [...left, ...right];
  });
}

function dayKey(t: number): string {
  return new Date(t).toDateString();
}
