import { describe, expect, it } from "vitest";
import { DEFAULT_WORK_HOURS, schedule, type Session } from "./scheduler";
import type { Task } from "./tasks";

// Monday 12 October 2026, device local time. Every test builds times with local constructors so it is time-zone independent.
const MON = 12;
const now = new Date(2026, 9, MON, 8, 0).getTime();
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const minutes = (start: number, end: number) => (end - start) / 60_000;

function task(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "t",
    type: "short_fixed",
    durationMin: 60,
    topic: null,
    deadline: null,
    spreadDays: null,
    conditionPlace: "any",
    held: false,
    unplaced: false,
    ...overrides,
  };
}

const run = (tasks: Task[], sessions: Session[] = []) => schedule(tasks, sessions, now, DEFAULT_WORK_HOURS);

describe("big tasks", () => {
  it("spreads sessions of about 60 minutes over distinct days in the window", () => {
    const placed = run([task({ id: "big", type: "big", durationMin: 300, spreadDays: 5 })]);
    expect(placed).toHaveLength(5);
    expect(placed.every((p) => minutes(p.start, p.end) === 60)).toBe(true);
    const days = new Set(placed.map((p) => new Date(p.start).toDateString()));
    expect(days.size).toBe(5);
    expect(placed.every((p) => p.start >= now && p.end <= at(MON + 5, 8))).toBe(true);
  });

  it("lengthens sessions when the window has fewer days than sessions", () => {
    // Two spread days from Monday 08:00 touch three calendar days, so 5 and 4 sessions cannot each get their own day.
    const placed = run([task({ id: "big", type: "big", durationMin: 300, spreadDays: 2 })]);
    expect(placed).toHaveLength(3);
    expect(placed.every((p) => minutes(p.start, p.end) === 100)).toBe(true);
  });

  it("places nothing when the task cannot fit", () => {
    expect(run([task({ id: "big", type: "big", durationMin: 1500, spreadDays: 1 })])).toEqual([]);
  });

  it("uses the deadline when it is earlier than the spread window", () => {
    const deadline = new Date(2026, 9, 14, 12).toISOString();
    const placed = run([task({ id: "big", type: "big", durationMin: 180, spreadDays: 10, deadline })]);
    expect(placed).toHaveLength(3);
    expect(placed.every((p) => p.end <= Date.parse(deadline))).toBe(true);
  });
});

describe("order", () => {
  it("places the earliest deadline first, and tasks with no deadline last", () => {
    const placed = run([
      task({ id: "none", title: "none" }),
      task({ id: "soon", deadline: new Date(2026, 9, MON, 18).toISOString() }),
    ]);
    const start = (id: string) => placed.find((p) => p.taskId === id)?.start;
    expect(start("soon")).toBe(at(MON, 8));
    expect(start("none")).toBe(at(MON, 9));
  });

  it("skips held tasks and tasks that already have sessions", () => {
    const placed = run(
      [task({ id: "held", held: true }), task({ id: "placed" })],
      [{ taskId: "placed", start: at(MON, 9), end: at(MON, 10) }],
    );
    expect(placed).toEqual([]);
  });

  it("works around sessions that are already in place", () => {
    const placed = run(
      [task({ id: "new", conditionPlace: "work" }), task({ id: "other" })],
      [{ taskId: "other", start: at(MON, 9), end: at(MON, 10) }],
    );
    expect(placed).toEqual([{ taskId: "new", start: at(MON, 10), end: at(MON, 11) }]);
  });
});

describe("work and home", () => {
  it("places Work tasks in work hours", () => {
    const placed = run([task({ id: "w", conditionPlace: "work" })]);
    expect(placed[0]?.start).toBe(at(MON, 9));
  });

  it("never lets a Work task straddle lunch", () => {
    const placed = schedule([task({ id: "w", conditionPlace: "work", durationMin: 120 })], [], at(MON, 11), DEFAULT_WORK_HOURS);
    expect(placed[0]?.start).toBe(at(MON, 13, 30));
  });

  it("places Home tasks outside work hours, and counts lunch as home", () => {
    expect(run([task({ id: "h", conditionPlace: "home" })])[0]?.start).toBe(at(MON, 8));
    const atNoon = schedule([task({ id: "h", conditionPlace: "home" })], [], at(MON, 11, 30), DEFAULT_WORK_HOURS);
    expect(atNoon[0]?.start).toBe(at(MON, 12));
  });

  it("lets Any tasks cross the work and lunch boundary as one session", () => {
    const placed = schedule([task({ id: "a", durationMin: 120 })], [], at(MON, 11), DEFAULT_WORK_HOURS);
    expect(placed).toEqual([{ taskId: "a", start: at(MON, 11), end: at(MON, 13) }]);
  });

  it("does not use Sunday-to-Thursday work hours on Friday or Saturday", () => {
    const friday = new Date(2026, 9, 16, 8).getTime();
    const placed = schedule([task({ id: "w", conditionPlace: "work" })], [], friday, DEFAULT_WORK_HOURS);
    expect(placed[0]?.start).toBe(at(18, 9));
  });
});

describe("work day tasks", () => {
  it("fills a day by duration, then moves to the next work day", () => {
    const placed = run([
      task({ id: "a", type: "work_day", durationMin: 300 }),
      task({ id: "b", type: "work_day", durationMin: 200 }),
    ]);
    expect(placed.find((p) => p.taskId === "a")?.start).toBe(at(MON, 9));
    expect(placed.find((p) => p.taskId === "b")?.start).toBe(at(MON + 1, 9));
  });

  it("keeps the last 2 hours of work time free, so 400 minutes never fits", () => {
    expect(run([task({ id: "a", type: "work_day", durationMin: 400 })])).toEqual([]);
  });

  it("is unplaced when it cannot fit before its deadline", () => {
    const deadline = new Date(2026, 9, MON, 16).toISOString();
    expect(run([task({ id: "a", type: "work_day", durationMin: 60, deadline })])).toEqual([]);
  });
});

describe("external busy time", () => {
  it("keeps placements out of busy time from outside the app", () => {
    // Monday 08:00 to 09:00 is busy in Google Calendar; a 60-minute task then starts at 09:00 or later.
    const external = [{ start: at(MON, 8), end: at(MON, 9) }];
    const [placed] = schedule([task({ durationMin: 60 })], [], now, DEFAULT_WORK_HOURS, external);
    expect(placed?.start).toBeGreaterThanOrEqual(at(MON, 9));
  });
});
