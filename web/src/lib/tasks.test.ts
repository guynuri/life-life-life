import { describe, expect, it } from "vitest";
import {
  parseTaskEdit,
  parseTaskInput,
  sortTasks,
  taskStatus,
  toLocalInputValue,
  type Task,
  moveSteps,
  moveToSteps,
  type TaskInput,
} from "./tasks";

const base: TaskInput = {
  title: "Renew passport",
  type: "short_fixed",
  durationMin: "30",
  topic: "",
  priority: "normal",
  deadline: "",
  spreadDays: "",
  conditionPlace: "any",
};

function task(overrides: Partial<Task>): Task {
  return {
    id: "t",
    title: "t",
    type: "short_fixed",
    durationMin: 30,
    topic: null,
    deadline: null,
    spreadDays: null,
    conditionPlace: "any",
    held: false,
    unplaced: false,
    done: false,
    position: 0,
    priority: "normal",
    ...overrides,
  };
}

describe("parseTaskInput", () => {
  it("accepts a short fixed task and turns a blank topic into null", () => {
    const result = parseTaskInput({ ...base, topic: "   " });
    expect(result).toEqual({
      ok: true,
      value: {
        title: "Renew passport",
        type: "short_fixed",
        durationMin: 30,
        topic: null,
        deadline: null,
        spreadDays: null,
        conditionPlace: "any",
        priority: "normal",
      },
    });
  });

  it("requires a title", () => {
    const result = parseTaskInput({ ...base, title: "  " });
    expect(result).toEqual({ ok: false, errors: ["Title is required."] });
  });

  it("requires a whole-number duration above 0", () => {
    for (const durationMin of ["", "0", "-5", "1.5", "abc"]) {
      const result = parseTaskInput({ ...base, durationMin });
      expect(result.ok).toBe(false);
    }
  });

  it("requires a spread for big tasks", () => {
    const missing = parseTaskInput({ ...base, type: "big", spreadDays: "" });
    expect(missing.ok).toBe(false);
    const ok = parseTaskInput({ ...base, type: "big", spreadDays: "3" });
    expect(ok.ok && ok.value.spreadDays).toBe(3);
  });

  it("drops the spread for non-big tasks", () => {
    const result = parseTaskInput({ ...base, type: "short_fixed", spreadDays: "3" });
    expect(result.ok && result.value.spreadDays).toBe(null);
  });

  it("forces Place = Work for work day tasks", () => {
    const result = parseTaskInput({ ...base, type: "work_day", conditionPlace: "home" });
    expect(result.ok && result.value.conditionPlace).toBe("work");
  });

  it("converts a deadline to an ISO timestamp", () => {
    const result = parseTaskInput({ ...base, deadline: "2026-10-12T17:30" });
    expect(result.ok && result.value.deadline).toBe(new Date(2026, 9, 12, 17, 30).toISOString());
  });

  it("rejects an invalid deadline", () => {
    const result = parseTaskInput({ ...base, deadline: "not a date" });
    expect(result.ok).toBe(false);
  });
});

describe("parseTaskEdit", () => {
  it("accepts title, duration and deadline, with a blank deadline meaning none", () => {
    const result = parseTaskEdit({ title: "New", durationMin: "45", deadline: "", priority: "normal" });
    expect(result).toEqual({ ok: true, value: { title: "New", durationMin: 45, deadline: null, priority: "normal" } });
  });

  it("rejects a blank title", () => {
    expect(parseTaskEdit({ title: "", durationMin: "45", deadline: "", priority: "normal" }).ok).toBe(false);
  });
});

describe("taskStatus", () => {
  it("is unplaced when there are no sessions and no hold", () => {
    expect(taskStatus(task({}), false)).toBe("unplaced");
  });

  it("is placed when there are sessions", () => {
    expect(taskStatus(task({}), true)).toBe("placed");
  });

  it("is unscheduled when held, even without sessions", () => {
    expect(taskStatus(task({ held: true }), false)).toBe("unscheduled");
  });
});

describe("sortTasks", () => {
  it("puts earliest deadlines first and no-deadline tasks last", () => {
    const sorted = sortTasks([
      task({ id: "none" }),
      task({ id: "late", deadline: "2026-10-20T00:00:00Z" }),
      task({ id: "early", deadline: "2026-10-10T00:00:00Z" }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["early", "late", "none"]);
  });

  it("does not mutate its input", () => {
    const input = [task({ id: "b", deadline: "2026-10-20T00:00:00Z" }), task({ id: "a" })];
    sortTasks(input);
    expect(input.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("toLocalInputValue", () => {
  it("formats an ISO timestamp as a local datetime-local value", () => {
    const iso = new Date(2026, 9, 12, 8, 5).toISOString();
    expect(toLocalInputValue(iso)).toBe("2026-10-12T08:05");
  });

  it("returns an empty string for no deadline", () => {
    expect(toLocalInputValue(null)).toBe("");
  });
});

describe("moveSteps", () => {
  const row = (id: string, position: number): Task => ({ ...task({ id, title: id }), position });

  it("swaps a row with its neighbour and rewrites only the rows that moved", () => {
    const list = [row("a", 0), row("b", 10), row("c", 20)];
    expect(moveSteps(list, 1, -1)).toEqual([
      { id: "b", position: 0 },
      { id: "a", position: 10 },
    ]);
  });

  it("writes nothing past either end, and nothing when already in step", () => {
    const list = [row("a", 0), row("b", 10)];
    expect(moveSteps(list, 0, -1)).toEqual([]);
    expect(moveSteps(list, 1, 1)).toEqual([]);
    expect(moveSteps([row("a", 0), row("b", 10), row("c", 20)], 2, 0 as never)).toEqual([]);
  });
});

describe("moveToSteps", () => {
  const row = (id: string, position: number): Task => ({ ...task({ id, title: id }), position });

  it("drops a row further down the list", () => {
    const list = [row("a", 0), row("b", 10), row("c", 20)];
    expect(moveToSteps(list, 0, 2)).toEqual([
      { id: "b", position: 0 },
      { id: "c", position: 10 },
      { id: "a", position: 20 },
    ]);
  });

  it("writes nothing when dropped where it already is or off the list", () => {
    const list = [row("a", 0), row("b", 10)];
    expect(moveToSteps(list, 1, 1)).toEqual([]);
    expect(moveToSteps(list, 0, 5)).toEqual([]);
  });
});
