import { describe, expect, it } from "vitest";
import { busySpans, decideSync, eventBody, eventSpan, rfc3339, type GoogleEvent } from "./calendarEvents";

// Monday 12 October 2026, device local time.
const at = (hour: number, minute = 0) => new Date(2026, 9, 12, hour, minute).getTime();
const timed = (id: string, startHour: number, endHour: number, extra: Partial<GoogleEvent> = {}): GoogleEvent => ({
  id,
  start: { dateTime: rfc3339(at(startHour)) },
  end: { dateTime: rfc3339(at(endHour)) },
  ...extra,
});

describe("eventBody", () => {
  it("titles the event with the task and links it back to the task and session", () => {
    const body = eventBody({ id: "task-1", title: "Pay rent" }, { id: "session-1", start: at(10), end: at(10, 20) });
    expect(body.summary).toBe("Pay rent");
    expect(body.start.dateTime).toBe(rfc3339(at(10)));
    expect(body.end.dateTime).toBe(rfc3339(at(10, 20)));
    expect(body.extendedProperties.private).toEqual({ taskId: "task-1", sessionId: "session-1" });
  });

  it("writes RFC 3339 times without milliseconds", () => {
    expect(rfc3339(Date.UTC(2026, 9, 12, 8, 0, 0, 500))).toBe("2026-10-12T08:00:00Z");
  });
});

describe("busySpans", () => {
  it("counts timed events, and ignores cancelled, free and all-day events", () => {
    const events: GoogleEvent[] = [
      timed("meeting", 10, 11),
      timed("cancelled", 12, 13, { status: "cancelled" }),
      timed("free", 14, 15, { transparency: "transparent" }),
      { id: "holiday", start: { date: "2026-10-12" }, end: { date: "2026-10-13" } },
    ];
    expect(busySpans(events)).toEqual([{ start: at(10), end: at(11) }]);
  });

  it("returns null span for all-day events", () => {
    expect(eventSpan({ id: "x", start: { date: "2026-10-12" }, end: { date: "2026-10-13" } })).toBeNull();
  });
});

describe("decideSync", () => {
  const session = { start: at(10), end: at(10, 20) };

  it("keeps the session when the event has not changed", () => {
    const same = { id: "e", start: { dateTime: rfc3339(at(10)) }, end: { dateTime: rfc3339(at(10, 20)) } };
    expect(decideSync(session, same)).toEqual({ kind: "keep" });
  });

  it("moves the session to a moved event's time, even outside work hours", () => {
    const moved = { id: "e", start: { dateTime: rfc3339(at(21)) }, end: { dateTime: rfc3339(at(21, 20)) } };
    expect(decideSync(session, moved)).toEqual({ kind: "move", start: at(21), end: at(21, 20) });
  });

  it("treats a missing or cancelled event as deleted", () => {
    expect(decideSync(session, null)).toEqual({ kind: "deleted" });
    expect(decideSync(session, { id: "e", status: "cancelled" })).toEqual({ kind: "deleted" });
  });

  it("ignores edits that do not change the time", () => {
    const renamed = { id: "e", summary: "Renamed in Google", start: { dateTime: rfc3339(at(10)) }, end: { dateTime: rfc3339(at(10, 20)) } };
    expect(decideSync(session, renamed)).toEqual({ kind: "keep" });
  });
});
