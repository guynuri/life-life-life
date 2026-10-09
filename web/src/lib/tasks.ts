// Pure task rules (SPEC 2.1, 2.6, 2.7). No DOM, no network.

export type TaskType = "big" | "work_day" | "short_fixed";
export type ConditionPlace = "any" | "work" | "home";
export type TaskStatus = "placed" | "unplaced" | "unscheduled";

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
}

export interface TaskEditInput {
  title: string;
  durationMin: string;
  deadline: string;
}

export type NewTask = Omit<Task, "id" | "held" | "unplaced">;
export type TaskEdit = Pick<Task, "title" | "durationMin" | "deadline">;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

// Status: held tasks are unscheduled; otherwise placed if they have sessions, else unplaced.
export function taskStatus(task: Pick<Task, "held">, placed: boolean): TaskStatus {
  if (task.held) return "unscheduled";
  return placed ? "placed" : "unplaced";
}

// Earliest deadline first, tasks without a deadline last. Ties keep their input order.
export function sortTasks(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (a.deadline === b.deadline) return 0;
    if (a.deadline === null) return 1;
    if (b.deadline === null) return -1;
    return Date.parse(a.deadline) - Date.parse(b.deadline);
  });
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
    value: { title, type: input.type, durationMin, topic, deadline, spreadDays, conditionPlace },
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
  return { ok: true, value: { title, durationMin, deadline } };
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
