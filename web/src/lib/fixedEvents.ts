// Pure fixed-event rules (design: pre-timed events). No DOM, no network. Times are epoch ms.
import { eventSpan, rfc3339, type EventBody, type GoogleEvent } from "./calendarEvents";

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
