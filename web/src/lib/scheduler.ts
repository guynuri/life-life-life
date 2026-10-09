// Pure scheduler (SPEC 2.2 to 2.5). No DOM, no network. "Now" and work hours are inputs; times are epoch ms in device local time.
import { sortTasks, type Task } from "./tasks";

export interface WorkHours {
  startMin: number; // minutes after local midnight
  endMin: number;
}
export interface Session {
  taskId: string;
  start: number;
  end: number;
}
export type Placement = Session;

export const DEFAULT_WORK_HOURS: WorkHours = { startMin: 9 * 60, endMin: 19 * 60 };

const LUNCH = { startMin: 12 * 60, endMin: 13 * 60 + 30 }; // [Decided] excluded from work time; counts as home
const RESERVE_MIN = 120; // [Assumed] last 2 hours of work time, never filled by Work day tasks
const SESSION_MIN = 60; // [Decided] default session length
const HORIZON_DAYS = 14; // [Assumed] window for tasks with no deadline (short fixed and Work day)
const STEP_MS = 15 * 60_000; // candidate starts and the work/home check use a 15-minute grid

interface Interval {
  start: number;
  end: number;
}

// Places every task that has no sessions and is not held. Returns only new placements; a task with none is unplaced.
export function schedule(tasks: readonly Task[], sessions: readonly Session[], now: number, work: WorkHours): Placement[] {
  const typeOf = new Map(tasks.map((task) => [task.id, task.type]));
  const busy: Interval[] = [];
  const dayUse = new Map<string, number>(); // Work day minutes already assigned, per local day
  for (const session of sessions) {
    if (typeOf.get(session.taskId) === "work_day") {
      const key = dayKey(session.start);
      dayUse.set(key, (dayUse.get(key) ?? 0) + (session.end - session.start) / 60_000);
    } else {
      busy.push({ start: session.start, end: session.end });
    }
  }

  const sessionTaskIds = new Set(sessions.map((session) => session.taskId));
  const placements: Placement[] = [];
  for (const task of sortTasks(tasks)) {
    if (task.held || sessionTaskIds.has(task.id)) continue;
    if (task.type === "work_day") {
      const placed = placeWorkDay(task, now, work, dayUse);
      if (placed) placements.push(...placed);
    } else {
      const placed = placeTimed(task, now, work, busy);
      if (placed) {
        placements.push(...placed);
        busy.push(...placed);
      }
    }
  }
  return placements;
}

// Big tasks: try the default session count first, then fewer, longer sessions until the task fits (SPEC 2.2).
// Short fixed tasks: one session, placed as early as possible in the window.
function placeTimed(task: Task, now: number, work: WorkHours, busy: readonly Interval[]): Placement[] | null {
  const deadline = task.deadline === null ? Infinity : Date.parse(task.deadline);
  const to =
    task.type === "big"
      ? Math.min(addDays(now, task.spreadDays ?? 0), deadline)
      : Math.min(deadline, addDays(now, HORIZON_DAYS));
  const spreadOffset = task.type === "big" ? 0.5 : 0; // big sessions aim at the middle of each slice of the window
  const maxSessions = task.type === "big" ? Math.ceil(task.durationMin / SESSION_MIN) : 1;
  for (let count = maxSessions; count >= 1; count--) {
    const placed = tryPlace(task, count, Math.ceil(task.durationMin / count), now, to, spreadOffset, work, busy);
    if (placed) return placed;
  }
  return null;
}

function tryPlace(
  task: Task,
  count: number,
  lengthMin: number,
  from: number,
  to: number,
  offset: number,
  work: WorkHours,
  busy: readonly Interval[],
): Placement[] | null {
  const length = lengthMin * 60_000;
  const local: Interval[] = [...busy];
  const usedDays = new Set<string>();
  const placed: Placement[] = [];
  for (let i = 0; i < count; i++) {
    const target = from + ((i + offset) * (to - from)) / count;
    const start = nearestSlot(task, target, from, to, length, work, local, usedDays);
    if (start === null) return null;
    const session = { taskId: task.id, start, end: start + length };
    placed.push(session);
    local.push(session);
    usedDays.add(dayKey(start));
  }
  return placed;
}

// The free start (on the grid, inside one day, on a day not yet used) closest to the target.
function nearestSlot(
  task: Task,
  target: number,
  from: number,
  to: number,
  length: number,
  work: WorkHours,
  busy: readonly Interval[],
  usedDays: Set<string>,
): number | null {
  let best: number | null = null;
  for (let start = Math.ceil(from / STEP_MS) * STEP_MS; start + length <= to; start += STEP_MS) {
    const key = dayKey(start);
    if (usedDays.has(key) || dayKey(start + length - 1) !== key) continue;
    if (!fitsPlace(task.conditionPlace, start, start + length, work)) continue;
    if (busy.some((b) => start < b.end && b.start < start + length)) continue;
    if (best === null || Math.abs(start - target) < Math.abs(best - target)) best = start;
  }
  return best;
}

// Work day tasks have no time slot: they take the earliest work day whose non-reserve time has room (SPEC 2.4).
function placeWorkDay(task: Task, now: number, work: WorkHours, dayUse: Map<string, number>): Placement[] | null {
  const deadline = task.deadline === null ? Infinity : Date.parse(task.deadline);
  const horizonEnd = Math.min(deadline, addDays(now, HORIZON_DAYS));
  const capacity = workDayCapacity(work);
  const today = new Date(now);
  for (let i = 0; ; i++) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    if (at(day, work.endMin - RESERVE_MIN) > horizonEnd) return null;
    const start = at(day, work.startMin);
    if (day.getDay() > 4 || start < now) continue; // work days are Sunday to Thursday; skip days already started
    const key = dayKey(start);
    const used = dayUse.get(key) ?? 0;
    if (used + task.durationMin > capacity) continue;
    dayUse.set(key, used + task.durationMin);
    return [{ taskId: task.id, start, end: start + task.durationMin * 60_000 }];
  }
}

// Minutes of work time a Work day task may fill on one day: work hours minus lunch minus the reserve.
function workDayCapacity(work: WorkHours): number {
  let minutes = 0;
  for (let m = work.startMin; m < work.endMin - RESERVE_MIN; m++) {
    if (m < LUNCH.startMin || m >= LUNCH.endMin) minutes++;
  }
  return minutes;
}

// Every 15-minute grid cell in [start, end) must be work time (place Work), or none may be (place Home).
function fitsPlace(place: Task["conditionPlace"], start: number, end: number, work: WorkHours): boolean {
  if (place === "any") return true;
  const wantWork = place === "work";
  for (let cell = Math.floor(start / STEP_MS) * STEP_MS; cell < end; cell += STEP_MS) {
    if (isWorkTime(cell, work) !== wantWork) return false;
  }
  return true;
}

// Work time: Sunday to Thursday, within work hours, outside lunch.
function isWorkTime(time: number, work: WorkHours): boolean {
  const date = new Date(time);
  const minute = date.getHours() * 60 + date.getMinutes();
  const inLunch = minute >= LUNCH.startMin && minute < LUNCH.endMin;
  return date.getDay() <= 4 && minute >= work.startMin && minute < work.endMin && !inLunch;
}

// Local calendar day key; sessions on the same key share a day.
function dayKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

// Same wall-clock time, n local days later (keeps working across daylight-saving changes).
function addDays(time: number, days: number): number {
  const date = new Date(time);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds()).getTime();
}

// Local time at minute `min` of the given calendar day.
function at(day: Date, min: number): number {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, min).getTime();
}
