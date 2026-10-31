import { describe, expect, it } from "vitest";
import type { GoogleEvent } from "./calendarEvents";
import { fixedEventBody, fixedEventsFrom, validateFixedEvent, type FixedEventInput } from "./fixedEvents";

const fixedEv = (id: string, start: string, end: string): GoogleEvent => ({
  id,
  summary: `Fixed ${id}`,
  start: { dateTime: new Date(start).toISOString() },
  end: { dateTime: new Date(end).toISOString() },
  extendedProperties: { private: { lifeKind: "fixed" } },
});
const sessionEv = (id: string, start: string, end: string): GoogleEvent => ({
  ...fixedEv(id, start, end),
  extendedProperties: { private: { taskId: "t", sessionId: "s" } },
});

const now = new Date(2026, 10, 2, 9, 0).getTime();
const ok: FixedEventInput = {
  title: "Haircut",
  start: new Date(2026, 10, 3, 10, 0).getTime(),
  durationMinutes: 60,
  calendarId: "cal",
};

describe("validateFixedEvent", () => {
  it("accepts a valid input", () => {
    expect(validateFixedEvent(ok, now)).toBeNull();
  });
  it("refuses a blank title", () => {
    expect(validateFixedEvent({ ...ok, title: "   " }, now)).not.toBeNull();
  });
  it("refuses a duration under 5 minutes", () => {
    expect(validateFixedEvent({ ...ok, durationMinutes: 4 }, now)).not.toBeNull();
  });
  it("refuses a fractional duration", () => {
    expect(validateFixedEvent({ ...ok, durationMinutes: 30.5 }, now)).not.toBeNull();
  });
  it("refuses a start in the past", () => {
    expect(validateFixedEvent({ ...ok, start: now - 1 }, now)).not.toBeNull();
  });
  it("refuses a missing calendar", () => {
    expect(validateFixedEvent({ ...ok, calendarId: "" }, now)).not.toBeNull();
  });
});

describe("fixedEventsFrom", () => {
  it("returns only fixed events, sorted by start", () => {
    const items = [
      { calendarId: "c", event: fixedEv("b", "2026-11-03T12:00:00", "2026-11-03T13:00:00") },
      { calendarId: "c", event: sessionEv("s", "2026-11-03T09:00:00", "2026-11-03T10:00:00") },
      { calendarId: "c", event: fixedEv("a", "2026-11-03T08:00:00", "2026-11-03T09:00:00") },
    ];
    expect(fixedEventsFrom(items).map((f) => f.eventId)).toEqual(["a", "b"]);
  });
  it("skips cancelled fixed events", () => {
    const cancelled = { ...fixedEv("x", "2026-11-03T08:00:00", "2026-11-03T09:00:00"), status: "cancelled" };
    expect(fixedEventsFrom([{ calendarId: "c", event: cancelled }])).toEqual([]);
  });
  it("keeps an event that crosses midnight as one item on its start day", () => {
    const late = fixedEv("m", "2026-11-03T23:30:00", "2026-11-04T00:30:00");
    const [item] = fixedEventsFrom([{ calendarId: "c", event: late }]);
    expect(item?.start).toBe(Date.parse(late.start?.dateTime ?? ""));
    expect(item?.end).toBe(Date.parse(late.end?.dateTime ?? ""));
  });
  it("carries the title and calendar", () => {
    const [item] = fixedEventsFrom([{ calendarId: "cal-1", event: fixedEv("a", "2026-11-03T08:00:00", "2026-11-03T09:00:00") }]);
    expect(item).toMatchObject({ eventId: "a", calendarId: "cal-1", title: "Fixed a" });
  });
});

describe("fixedEventBody", () => {
  it("uses the trimmed title, the calendar's default reminders, and the fixed tag", () => {
    const body = fixedEventBody({ ...ok, title: "  Haircut " });
    expect(body.summary).toBe("Haircut");
    expect(body.reminders).toEqual({ useDefault: true });
    expect(body.extendedProperties.private).toEqual({ lifeKind: "fixed" });
  });
  it("ends the event after its duration", () => {
    const body = fixedEventBody(ok);
    expect(Date.parse(body.end.dateTime) - Date.parse(body.start.dateTime)).toBe(60 * 60_000);
  });
});
