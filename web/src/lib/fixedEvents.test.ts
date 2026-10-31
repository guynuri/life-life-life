import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GoogleEvent } from "./calendarEvents";
import { createEvent, deleteEvent, listCalendars, moveEventToCalendar, patchEvent } from "./calendar";
import {
  clearCalendarCache,
  createFixedEvent,
  deleteFixedEvent,
  fixedEventBody,
  fixedEventsFrom,
  getCalendars,
  parseLocalInput,
  toLocalInput,
  updateFixedEvent,
  validateFixedEvent,
  type FixedEventInput,
} from "./fixedEvents";

vi.mock("./calendar", () => ({
  createEvent: vi.fn(),
  patchEvent: vi.fn(),
  moveEventToCalendar: vi.fn(),
  deleteEvent: vi.fn(),
  listCalendars: vi.fn(async () => [
    { id: "primary", summary: "Me", writable: true },
    { id: "holidays", summary: "Holidays", writable: false },
  ]),
}));

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

describe("local date-time input values", () => {
  it("formats a time for a datetime-local input in device time", () => {
    expect(toLocalInput(new Date(2026, 10, 3, 9, 5).getTime())).toBe("2026-11-03T09:05");
  });
  it("reads the input back as the same device time", () => {
    expect(parseLocalInput("2026-11-03T09:05")).toBe(new Date(2026, 10, 3, 9, 5).getTime());
  });
  it("returns NaN for an empty input", () => {
    expect(parseLocalInput("")).toBeNaN();
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

describe("category list cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearCalendarCache();
  });

  it("lists writable calendars once per session until cleared", async () => {
    await expect(getCalendars("t")).resolves.toEqual([{ id: "primary", summary: "Me", writable: true }]);
    await getCalendars("t");
    expect(listCalendars).toHaveBeenCalledTimes(1);
    clearCalendarCache();
    await getCalendars("t");
    expect(listCalendars).toHaveBeenCalledTimes(2);
  });
});

describe("fixed event Google calls", () => {
  beforeEach(() => vi.clearAllMocks());

  it("patches without moving when the category is unchanged", async () => {
    await updateFixedEvent("t", { eventId: "e", calendarId: "c" }, { ...ok, calendarId: "c" });
    expect(moveEventToCalendar).not.toHaveBeenCalled();
    expect(patchEvent).toHaveBeenCalledWith("t", "c", "e", expect.any(Object));
  });

  it("patches on the old calendar, then moves, when the category changes", async () => {
    await updateFixedEvent("t", { eventId: "e", calendarId: "c" }, { ...ok, calendarId: "d" });
    expect(patchEvent).toHaveBeenCalledWith("t", "c", "e", expect.any(Object));
    expect(moveEventToCalendar).toHaveBeenCalledWith("t", "c", "e", "d");
    // A failed move can be retried from the same form: the event is still on the calendar the form holds.
    expect(vi.mocked(patchEvent).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(moveEventToCalendar).mock.invocationCallOrder[0] ?? 0);
  });

  it("refuses an invalid edit before calling Google", async () => {
    await expect(updateFixedEvent("t", { eventId: "e", calendarId: "c" }, { ...ok, durationMinutes: 1 })).rejects.toThrow();
    expect(patchEvent).not.toHaveBeenCalled();
  });

  it("refuses an invalid create before calling Google", async () => {
    await expect(createFixedEvent("t", { ...ok, title: "" })).rejects.toThrow();
    expect(createEvent).not.toHaveBeenCalled();
  });

  it("creates on the chosen calendar and returns the new id", async () => {
    vi.mocked(createEvent).mockResolvedValue("new-id");
    await expect(createFixedEvent("t", ok)).resolves.toBe("new-id");
    expect(createEvent).toHaveBeenCalledWith("t", "cal", expect.objectContaining({ summary: "Haircut" }));
  });

  it("deletes on the event's own calendar", async () => {
    await deleteFixedEvent("t", { eventId: "e", calendarId: "c" });
    expect(deleteEvent).toHaveBeenCalledWith("t", "c", "e");
  });
});
