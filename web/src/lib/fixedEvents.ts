// Pure fixed-event rules (design: pre-timed events). No DOM, no network. Times are epoch ms.
import { rfc3339, type EventBody } from "./calendarEvents";

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
