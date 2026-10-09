// Pure reminder rules (SPEC 5). No DOM, no network: "now", the time zone and the reminder time are inputs.
// The send-reminders Edge Function imports this file too, so it is the only copy of these rules. Keep it free of browser and Deno APIs.
import { dueAtMs, isDue, type Person } from "./people.ts";

export const SESSION_LEAD_MS = 10 * 60_000; // [Decided] a session reminder goes out 10 minutes before it starts

// One row per reminder. The dedupe key makes each reminder go out at most once.
export interface Reminder {
  dedupeKey: string;
  fireAt: number;
  title: string;
  body: string;
}

export interface SessionStart {
  id: string;
  start: number;
  taskTitle: string;
}

export interface PlacedSession {
  taskTitle: string;
  start: number;
}

function parts(ms: number, zone: string, options: Intl.DateTimeFormatOptions): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of new Intl.DateTimeFormat("en-GB", { timeZone: zone, hourCycle: "h23", ...options }).formatToParts(ms)) {
    out[part.type] = part.value;
  }
  return out;
}

// Minutes after local midnight in the given zone.
export function localMinutes(ms: number, zone: string): number {
  const p = parts(ms, zone, { hour: "2-digit", minute: "2-digit" });
  return Number(p.hour) * 60 + Number(p.minute);
}

export function formatTime(ms: number, zone: string): string {
  const p = parts(ms, zone, { hour: "2-digit", minute: "2-digit" });
  return `${p.hour}:${p.minute}`;
}

export function formatWhen(ms: number, zone: string): string {
  const p = parts(ms, zone, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${p.weekday} ${p.day} ${p.month} ${p.hour}:${p.minute}`;
}

// Sessions that start within the next 10 minutes (SPEC 5). The caller keeps the ones already sent.
export function sessionReminders(sessions: readonly SessionStart[], now: number, zone: string): Reminder[] {
  return sessions
    .filter((s) => now >= s.start - SESSION_LEAD_MS && now < s.start)
    .map((s) => ({
      dedupeKey: `session:${s.id}:${s.start}`,
      fireAt: s.start - SESSION_LEAD_MS,
      title: s.taskTitle,
      body: `Starts at ${formatTime(s.start, zone)}.`,
    }));
}

// Due people, once the reminder time has passed on the day they are due (SPEC 5, 3.2). Due rule: people.ts.
// A reminder is keyed by the due time, so each due instance is reminded once; contacting the person starts a new one.
export function personReminders(people: readonly Person[], now: number, zone: string, reminderMin: number): Reminder[] {
  if (localMinutes(now, zone) < reminderMin) return [];
  return people
    .filter((p) => isDue(p, now))
    .map((p) => ({
      dedupeKey: `person:${p.id}:${dueAtMs(p)}`,
      fireAt: now,
      title: `Contact ${p.name}`,
      body: `Due for contact (tier ${p.tier}).`,
    }));
}

// One batched message per scheduler run (SPEC 5). Returns null when the run placed and unplaced nothing.
export function placementReminder(
  placed: readonly PlacedSession[],
  unplaced: readonly string[],
  now: number,
  zone: string,
  runId: string,
): Reminder | null {
  if (placed.length === 0 && unplaced.length === 0) return null;
  const lines = [
    ...placed.map((p) => `Placed: ${p.taskTitle}, ${formatWhen(p.start, zone)}.`),
    ...unplaced.map((title) => `Could not fit by its deadline: ${title}.`),
  ];
  return { dedupeKey: `placement:${runId}`, fireAt: now, title: "Schedule updated", body: lines.join("\n") };
}

// "HH:MM" from a time input, as minutes after midnight; null when it is not a time of day.
export function parseTimeOfDay(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour < 24 && minute < 60 ? hour * 60 + minute : null;
}

export function formatTimeOfDay(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
