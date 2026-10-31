import { describe, expect, it } from "vitest";
import { fixedEventBody, validateFixedEvent, type FixedEventInput } from "./fixedEvents";

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
