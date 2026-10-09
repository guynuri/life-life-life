// Pure Today rules (SPEC 6). No DOM, no network: "now" is always an input. Days are the device's local calendar days.
import type { Task } from "./tasks";

export interface DayBounds {
  start: number; // local midnight
  end: number; // next local midnight
}

export interface TodaySession {
  id: string;
  start: number;
  end: number;
  title: string;
  topic: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function dayBounds(now: Date): DayBounds {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  return { start: new Date(y, m, d).getTime(), end: new Date(y, m, d + 1).getTime() };
}

// Sessions that start on the given day, in time order. Titles come from the matching task.
export function todaySessions(
  sessions: readonly { id: string; taskId: string; start: number; end: number }[],
  tasks: readonly Task[],
  bounds: DayBounds,
): TodaySession[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return sessions
    .filter((s) => s.start >= bounds.start && s.start < bounds.end)
    .sort((a, b) => a.start - b.start)
    .map((s) => {
      const task = byId.get(s.taskId);
      return { id: s.id, start: s.start, end: s.end, title: task?.title ?? "Unknown task", topic: task?.topic ?? null };
    });
}

// 24-hour local clock time, "HH:MM". Fixed format so it does not depend on the browser locale.
export function formatClock(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatSessionTime(start: number, end: number): string {
  return `${formatClock(start)}–${formatClock(end)}`;
}

// Greeting for the Today hero, from the local hour.
export function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

// The session in progress, or the next one to start. Null when none is left today.
export function nextSession(sessions: readonly TodaySession[], now: number): TodaySession | null {
  return sessions.find((s) => s.end > now) ?? null;
}
