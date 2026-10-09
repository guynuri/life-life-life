import { expect, test } from "vitest";
import { dayBounds, formatSessionTime, todaySessions } from "./today";
import type { Task } from "./tasks";

const at = (y: number, m: number, d: number, h = 0, min = 0) => new Date(y, m, d, h, min).getTime();

const task = (id: string, title: string, topic: string | null = null): Task => ({
  id,
  title,
  type: "short_fixed",
  durationMin: 30,
  topic,
  deadline: null,
  spreadDays: null,
  conditionPlace: "any",
  held: false,
});

test("day bounds run from local midnight to the next local midnight, across a month end", () => {
  const bounds = dayBounds(new Date(2026, 9, 31, 23, 30));
  expect(bounds.start).toBe(at(2026, 9, 31));
  expect(bounds.end).toBe(at(2026, 10, 1));
});

test("today's sessions are sorted by start, exclude other days, and carry the task title and topic", () => {
  const bounds = dayBounds(new Date(2026, 9, 12, 8, 0));
  const tasks = [task("a", "Write essay", "Uni"), task("b", "Pay rent")];
  const sessions = [
    { id: "late", taskId: "a", start: at(2026, 9, 12, 14), end: at(2026, 9, 12, 15) },
    { id: "tomorrow", taskId: "b", start: at(2026, 9, 13, 9), end: at(2026, 9, 13, 9, 20) },
    { id: "early", taskId: "b", start: at(2026, 9, 12, 9), end: at(2026, 9, 12, 9, 20) },
    { id: "yesterday", taskId: "b", start: at(2026, 9, 11, 9), end: at(2026, 9, 11, 9, 20) },
  ];
  const result = todaySessions(sessions, tasks, bounds);
  expect(result.map((s) => s.id)).toEqual(["early", "late"]);
  expect(result[0]).toMatchObject({ title: "Pay rent", topic: null });
  expect(result[1]).toMatchObject({ title: "Write essay", topic: "Uni" });
});

test("a session whose task is missing is still shown, with a fallback title", () => {
  const bounds = dayBounds(new Date(2026, 9, 12, 8, 0));
  const result = todaySessions([{ id: "x", taskId: "gone", start: at(2026, 9, 12, 10), end: at(2026, 9, 12, 10, 5) }], [], bounds);
  expect(result[0]?.title).toBe("Unknown task");
});

test("session time is HH:MM to HH:MM with zero padding", () => {
  expect(formatSessionTime(at(2026, 9, 12, 9, 5), at(2026, 9, 12, 13, 30))).toBe("09:05–13:30");
});
