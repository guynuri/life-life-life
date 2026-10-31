// Pure fixed-event rules (design: pre-timed events). No DOM, no network. Times are epoch ms.
import { eventSpan, rfc3339, type EventBody, type GoogleEvent } from "./calendarEvents";
import { createEvent, deleteEvent, moveEventToCalendar, patchEvent } from "./calendar";

// A fixed event as the Today view and the form see it.
export interface FixedEvent {
  eventId: string;
  calendarId: string;
  title: string;
  start: number;
  end: number;
}

export interface FixedEventInput {
  title: string;
  start: number;
  durationMinutes: number;
  calendarId: string;
}

const MINUTE_MS = 60_000;
const MIN_DURATION_MINUTES = 5;

// The first problem with the input as a message, or null when it can be saved.
export function validateFixedEvent(input: FixedEventInput, now: number): string | null {
  if (input.title.trim() === "") return "Add a title.";
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < MIN_DURATION_MINUTES) {
    return `Duration must be a whole number of minutes, ${MIN_DURATION_MINUTES} or more.`;
  }
  if (input.calendarId === "") return "Choose a category.";
  if (input.start < now) return "The start is in the past.";
  return null;
}

// Device-local "YYYY-MM-DDTHH:mm", the value a datetime-local input uses.
const pad = (n: number) => String(n).padStart(2, "0");
export function toLocalInput(time: number): string {
  const d = new Date(time);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The epoch ms for a datetime-local value read as device time; NaN when empty or malformed.
export function parseLocalInput(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return NaN;
  const [, y, mo, d, h, mi] = match.map(Number) as [number, number, number, number, number, number];
  return new Date(y, mo - 1, d, h, mi).getTime();
}

// Google calls. Each validates first and throws the message, so the form can show it; nothing is hidden.
export interface FixedEventRef {
  eventId: string;
  calendarId: string;
}

export async function createFixedEvent(token: string | null, input: FixedEventInput): Promise<string> {
  const problem = validateFixedEvent(input, Date.now());
  if (problem) throw new Error(problem);
  return createEvent(token, input.calendarId, fixedEventBody(input));
}

// A category change moves the event first, then the fields are patched on its new calendar.
export async function updateFixedEvent(token: string | null, current: FixedEventRef, next: FixedEventInput): Promise<void> {
  const problem = validateFixedEvent(next, Date.now());
  if (problem) throw new Error(problem);
  let calendarId = current.calendarId;
  if (next.calendarId !== current.calendarId) {
    await moveEventToCalendar(token, current.calendarId, current.eventId, next.calendarId);
    calendarId = next.calendarId;
  }
  const body = fixedEventBody(next);
  await patchEvent(token, calendarId, current.eventId, { summary: body.summary, start: body.start, end: body.end });
}

export async function deleteFixedEvent(token: string | null, current: FixedEventRef): Promise<void> {
  await deleteEvent(token, current.calendarId, current.eventId);
}

// The fixed events among the given items, in start order. Cancelled and all-day events are skipped.
export function fixedEventsFrom(items: readonly { calendarId: string; event: GoogleEvent }[]): FixedEvent[] {
  const fixed: FixedEvent[] = [];
  for (const { calendarId, event } of items) {
    if (event.extendedProperties?.private?.lifeKind !== "fixed" || event.status === "cancelled") continue;
    const span = eventSpan(event);
    if (span === null) continue;
    fixed.push({ eventId: event.id, calendarId, title: event.summary ?? "", start: span.start, end: span.end });
  }
  return fixed.sort((a, b) => a.start - b.start);
}

// Calendar defaults apply to the event. The private tag marks it as a fixed event the app created.
export function fixedEventBody(input: FixedEventInput): EventBody {
  return {
    summary: input.title.trim(),
    start: { dateTime: rfc3339(input.start) },
    end: { dateTime: rfc3339(input.start + input.durationMinutes * MINUTE_MS) },
    extendedProperties: { private: { lifeKind: "fixed" } },
    reminders: { useDefault: true },
  };
}
