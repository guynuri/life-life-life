// Pure task rules (SPEC 2.1, 2.6, 2.7). No DOM, no network.

export type TaskType = "big" | "work_day" | "short_fixed";
export type ConditionPlace = "any" | "work" | "home";
export type TaskStatus = "placed" | "unplaced" | "unscheduled" | "done";
export type Priority = "high" | "normal" | "low";
export const PRIORITIES: readonly Priority[] = ["high", "normal", "low"];
const PRIORITY_RANK: Record<Priority, number> = { high: 0, normal: 1, low: 2 };

export interface Task {
  id: string;
  title: string;
  type: TaskType;
  durationMin: number;
  topic: string | null;
  deadline: string | null;
  spreadDays: number | null;
  conditionPlace: ConditionPlace;
  held: boolean;
  unplaced: boolean; // unplaced after the last placement run; lets a newly unplaced task be announced once (SPEC 5)
  done: boolean; // [Assumed] completed by the user; hidden by default and never placed (SPEC 2.7)
  priority: Priority; // [Assumed] tiebreaker after deadline (SPEC 2.3); set in the form or the edit sheet
  position: number; // [Assumed] manual display order (Move up, Move down). Display only: placement ignores it
}

// Raw form values, all strings as typed.
export interface TaskInput {
  title: string;
  type: TaskType;
  durationMin: string;
  topic: string;
  deadline: string; // datetime-local value, or "" for none
  spreadDays: string;
  conditionPlace: ConditionPlace;
  priority: Priority;
}

export interface TaskEditInput {
  title: string;
  durationMin: string;
  deadline: string;
  priority: Priority;
}

export type NewTask = Omit<Task, "id" | "held" | "unplaced" | "done" | "position">;
export type TaskEdit = Pick<Task, "title" | "durationMin" | "deadline" | "priority">;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// Status: held tasks are unscheduled; otherwise placed if they have sessions, else unplaced.
export function taskStatus(task: Pick<Task, "held" | "done">, placed: boolean): TaskStatus {
  if (task.done) return "done";
  if (task.held) return "unscheduled";
  return placed ? "placed" : "unplaced";
}

// Earliest deadline first, tasks without a deadline last; then higher priority first (SPEC 2.3). Ties keep their input order.
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.deadline !== b.deadline) {
      if (a.deadline === null) return 1;
      if (b.deadline === null) return -1;
      return Date.parse(a.deadline) - Date.parse(b.deadline);
    }
    return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  });
}

// Manual order (SPEC 2.7, assumed) is kept in steps of 10, so a move rewrites only the rows that are out of step.
export const ORDER_STEP = 10;

// The rows to write when the task at index moves up (-1) or down (+1) in the displayed list. Display only.
export function moveSteps(tasks: readonly Task[], index: number, direction: -1 | 1): { id: string; position: number }[] {
  return moveToSteps(tasks, index, index + direction);
}

// The rows to write when the task at from is dropped at to (drag, or Move up and down). Display only.
export function moveToSteps(tasks: readonly Task[], from: number, to: number): { id: string; position: number }[] {
  const moved = tasks[from];
  if (!moved || from === to || to < 0 || to >= tasks.length) return [];
  const next = [...tasks];
  next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.flatMap((t, i) => (t.position === i * ORDER_STEP ? [] : [{ id: t.id, position: i * ORDER_STEP }]));
}

export function parsePriority(raw: string): Priority {
  return raw === "high" || raw === "low" ? raw : "normal";
}

export function parseTaskInput(input: TaskInput): ParseResult<NewTask> {
  const errors: string[] = [];
  const title = parseTitle(input.title, errors);
  const durationMin = parseDuration(input.durationMin, errors);
  const deadline = parseDeadline(input.deadline, errors);

  let spreadDays: number | null = null;
  let conditionPlace: ConditionPlace = input.conditionPlace;
  if (input.type === "big") {
    spreadDays = parseSpread(input.spreadDays, errors);
  }
  if (input.type === "work_day") {
    conditionPlace = "work";
  }

  if (errors.length > 0 || title === null || durationMin === null) {
    return { ok: false, errors };
  }
  const topic = input.topic.trim() || null;
  return {
    ok: true,
    value: { title, type: input.type, durationMin, topic, deadline, spreadDays, conditionPlace, priority: parsePriority(input.priority) },
  };
}

export function parseTaskEdit(input: TaskEditInput): ParseResult<TaskEdit> {
  const errors: string[] = [];
  const title = parseTitle(input.title, errors);
  const durationMin = parseDuration(input.durationMin, errors);
  const deadline = parseDeadline(input.deadline, errors);
  if (errors.length > 0 || title === null || durationMin === null) {
    return { ok: false, errors };
  }
  return { ok: true, value: { title, durationMin, deadline, priority: parsePriority(input.priority) } };
}

// Converts an ISO timestamp to the value a datetime-local input expects (device local time).
export function toLocalInputValue(iso: string | null): string {
  if (iso === null) return "";
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseTitle(raw: string, errors: string[]): string | null {
  const title = raw.trim();
  if (title === "") {
    errors.push("Title is required.");
    return null;
  }
  return title;
}

function parseDuration(raw: string, errors: string[]): number | null {
  const value = Number(raw.trim());
  if (raw.trim() === "" || !Number.isInteger(value) || value <= 0) {
    errors.push("Duration must be a whole number of minutes, more than 0.");
    return null;
  }
  return value;
}

function parseSpread(raw: string, errors: string[]): number | null {
  const value = Number(raw.trim());
  if (raw.trim() === "" || !Number.isInteger(value) || value <= 0) {
    errors.push("Big tasks need a spread of whole days, more than 0.");
    return null;
  }
  return value;
}

function parseDeadline(raw: string, errors: string[]): string | null {
  if (raw.trim() === "") return null;
  const time = Date.parse(raw);
  if (Number.isNaN(time)) {
    errors.push("Deadline is not a valid date and time.");
    return null;
  }
  return new Date(time).toISOString();
}
