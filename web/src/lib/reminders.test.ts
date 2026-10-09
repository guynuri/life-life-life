import { describe, expect, it } from "vitest";
import { formatTimeOfDay, localMinutes, parseTimeOfDay, personReminders, placementReminder, sessionReminders, SESSION_LEAD_MS } from "./reminders";
import type { Person } from "./people";

const ZONE = "UTC";
const at = (h: number, m = 0, day = 12) => Date.UTC(2026, 9, day, h, m);
const DAY = 24 * 60 * 60 * 1000;

function person(overrides: Partial<Person>): Person {
  return {
    id: "p1",
    name: "Dana",
    tier: 2,
    intervalDays: null,
    lastContactedAt: null,
    createdAt: new Date(at(8, 0, 1)).toISOString(),
    ...overrides,
  };
}

describe("session reminders", () => {
  const start = at(10, 0);

  it("fires for a session starting within the next 10 minutes", () => {
    const [reminder] = sessionReminders([{ id: "s1", start, taskTitle: "Pay rent" }], start - 10 * 60_000, ZONE);
    expect(reminder?.fireAt).toBe(start - SESSION_LEAD_MS);
    expect(reminder?.title).toBe("Pay rent");
    expect(reminder?.dedupeKey).toBe(`session:s1:${start}`);
  });

  it("does not fire 11 minutes before, or after the start", () => {
    const session = [{ id: "s1", start, taskTitle: "Pay rent" }];
    expect(sessionReminders(session, start - 11 * 60_000, ZONE)).toEqual([]);
    expect(sessionReminders(session, start, ZONE)).toEqual([]);
  });
});

describe("person reminders", () => {
  const nineteen = 19 * 60;

  it("waits for the reminder time on the due day", () => {
    const due = person({ intervalDays: 1, createdAt: new Date(at(8, 0, 1)).toISOString() });
    expect(personReminders([due], at(18, 59, 2), ZONE, nineteen)).toEqual([]);
    const [reminder] = personReminders([due], at(19, 0, 2), ZONE, nineteen);
    expect(reminder?.title).toBe("Contact Dana");
    expect(reminder?.dedupeKey).toBe(`person:p1:${Date.parse(due.createdAt) + DAY}`);
  });

  it("uses the due rule from people.ts: a person who is not due gets nothing", () => {
    const fresh = person({ tier: 2 });
    expect(personReminders([fresh], at(20, 0, 2), ZONE, nineteen)).toEqual([]);
  });
});

describe("placement reminder", () => {
  it("is null when nothing was placed or left unplaced", () => {
    expect(placementReminder([], [], at(8), ZONE, "run1")).toBeNull();
  });

  it("batches placed sessions and unplaced tasks into one message", () => {
    const reminder = placementReminder(
      [{ taskTitle: "Pay rent", start: at(10) }],
      ["Write report"],
      at(8),
      ZONE,
      "run1",
    );
    expect(reminder?.dedupeKey).toBe("placement:run1");
    expect(reminder?.body.split("\n")).toEqual([
      expect.stringContaining("Placed: Pay rent"),
      "Could not fit by its deadline: Write report.",
    ]);
  });
});

describe("localMinutes", () => {
  it("reads the wall-clock minute in the given zone", () => {
    expect(localMinutes(at(19, 30), "UTC")).toBe(19 * 60 + 30);
    expect(localMinutes(at(19, 30), "Asia/Jerusalem")).toBe(22 * 60 + 30);
  });
});

describe("time of day", () => {
  it("parses HH:MM and rejects anything else", () => {
    expect(parseTimeOfDay("19:00")).toBe(19 * 60);
    expect(parseTimeOfDay("7:05")).toBe(7 * 60 + 5);
    expect(parseTimeOfDay("24:00")).toBeNull();
    expect(parseTimeOfDay("soon")).toBeNull();
    expect(formatTimeOfDay(19 * 60)).toBe("19:00");
  });
});
