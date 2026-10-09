import { useEffect, useState, type FormEvent } from "react";
import { placementQueue } from "./lib/serialQueue";
import {
  parseTaskEdit,
  parseTaskInput,
  sortTasks,
  taskStatus,
  toLocalInputValue,
  type ConditionPlace,
  type Task,
  type TaskEditInput,
  type TaskInput,
  type TaskType,
} from "./lib/tasks";
import {
  getWorkHours,
  insertTask,
  listSessions,
  listTasks,
  releaseHold,
  saveWorkHours,
  updateTaskEdit,
  type StoredSession,
} from "./lib/tasksData";
import { deleteTaskWithEvents, moveSessionWithEvent, placeTasks, replacePlacement, unscheduleTask } from "./lib/calendarSync";
import { isGoogleAuthError } from "./lib/calendar";
import type { Placement, WorkHours } from "./lib/scheduler";

interface TasksProps {
  googleToken: string | null; // from the Supabase session; null when Google access is missing
  onReconnect: () => void;
  refreshTick: number; // bumped by the shell's Refresh, after it has placed (SPEC Pages)
}

const TYPE_LABELS: Record<TaskType, string> = {
  big: "Big",
  work_day: "Work day",
  short_fixed: "Short fixed item",
};

const STATUS_LABELS = {
  placed: "Placed",
  unplaced: "Unplaced",
  unscheduled: "Unscheduled",
} as const;

const PLACE_LABELS: Record<ConditionPlace, string> = { any: "Any", work: "Work", home: "Home" };

const emptyForm: TaskInput = {
  title: "",
  type: "short_fixed",
  durationMin: "",
  topic: "",
  deadline: "",
  spreadDays: "",
  conditionPlace: "any",
};

interface Loaded {
  tasks: Task[];
  sessions: StoredSession[];
  work: WorkHours;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadAll(): Promise<Loaded> {
  const [tasks, sessions, work] = await Promise.all([listTasks(), listSessions(), getWorkHours()]);
  return { tasks, sessions, work };
}

// Parses "HH:MM" from a time input into minutes after midnight.
function timeToMinutes(value: string): number {
  const [hours = NaN, minutes = NaN] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function describeSession(task: Task, session: StoredSession): string {
  const start = new Date(session.start);
  if (task.type === "work_day") {
    return start.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
  }
  const day = start.toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `${day} to ${new Date(session.end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function Tasks({ googleToken, onReconnect, refreshTick }: TasksProps) {
  // Holds what was last read from the database. Writes never change it locally; the data is reloaded after each save.
  const [data, setData] = useState<Loaded | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [reconnect, setReconnect] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [form, setForm] = useState<TaskInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<TaskEditInput>({ title: "", durationMin: "", deadline: "" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveValue, setMoveValue] = useState("");

  // Shows a failed action. Google auth failures also offer Reconnect. Never throws.
  function fail(message: string, error: unknown) {
    setErrors([`${message}: ${messageOf(error)}`]);
    setReconnect(isGoogleAuthError(error));
  }

  // Syncs with Google, places unplaced, unheld tasks (SPEC 2.3), then shows what is stored. Never throws.
  async function placeAndLoad() {
    let placed: Placement[] = [];
    try {
      placed = await placeTasks(googleToken, Date.now());
      setReconnect(false);
    } catch (error) {
      fail("Could not place tasks", error);
    }
    await loadStored(placed);
  }

  // Shows what is stored (SPEC 2.5). Announces new placements from this run only.
  async function loadStored(placed: Placement[] = []) {
    try {
      const loaded = await loadAll();
      setData(loaded);
      const titles = new Map(loaded.tasks.map((task) => [task.id, task.title]));
      // Announce new placements (SPEC 2.5). A run that places nothing keeps the last announcement visible.
      if (placed.length > 0) {
        setNotices(
          [...new Set(placed.map((p) => p.taskId))].map((id) => {
            const count = placed.filter((p) => p.taskId === id).length;
            return `Placed "${titles.get(id) ?? "task"}": ${count} ${count === 1 ? "session" : "sessions"}.`;
          }),
        );
      }
    } catch (error) {
      setErrors([`Could not load tasks: ${messageOf(error)}`]);
    }
  }

  // Placement runs go through the shared queue, so they never overlap (see serialQueue.ts).
  function refresh(): Promise<void> {
    return placementQueue(placeAndLoad);
  }

  // First mount places and loads. A later tick comes from the shell after it has placed, so this page only reloads.
  useEffect(() => {
    if (refreshTick === 0) void refresh();
    else void placementQueue(() => loadStored());
  }, [refreshTick]);

  async function add(event: FormEvent) {
    event.preventDefault();
    const parsed = parseTaskInput(form);
    if (!parsed.ok) return setErrors(parsed.errors);
    try {
      await insertTask(parsed.value);
    } catch (error) {
      return setErrors([`Could not save task: ${messageOf(error)}`]);
    }
    setForm(emptyForm);
    setErrors([]);
    await refresh();
  }

  function startEdit(task: Task) {
    setEditingId(task.id);
    setConfirmingId(null);
    setEdit({
      title: task.title,
      durationMin: String(task.durationMin),
      deadline: toLocalInputValue(task.deadline),
    });
  }

  async function saveEdit(id: string) {
    const parsed = parseTaskEdit(edit);
    if (!parsed.ok) return setErrors(parsed.errors);
    const task = data?.tasks.find((t) => t.id === id);
    const timeChanged = task !== undefined && (task.durationMin !== parsed.value.durationMin || !sameInstant(task.deadline, parsed.value.deadline));
    try {
      // A changed duration or deadline replaces the placement: Google events go first, then the sessions (SPEC 2.5).
      if (timeChanged) await replacePlacement(googleToken, id);
      await updateTaskEdit(id, parsed.value);
    } catch (error) {
      return fail("Could not save task", error);
    }
    setEditingId(null);
    setErrors([]);
    await refresh();
  }

  // Google is called before the database, so a failure here leaves the stored state on screen unchanged.
  async function unschedule(id: string) {
    try {
      await unscheduleTask(googleToken, id);
    } catch (error) {
      return fail("Could not unschedule task", error);
    }
    setErrors([]);
    await refresh();
  }

  async function releaseTask(id: string) {
    try {
      await releaseHold(id);
    } catch (error) {
      return setErrors([`Could not schedule task: ${messageOf(error)}`]);
    }
    setErrors([]);
    await refresh();
  }

  function startMove(session: StoredSession) {
    setMovingId(session.id);
    setMoveValue(toLocalInputValue(new Date(session.start).toISOString()));
  }

  async function saveMove(session: StoredSession) {
    const start = Date.parse(moveValue);
    if (Number.isNaN(start)) return setErrors(["Choose a valid date and time for the session."]);
    try {
      await moveSessionWithEvent(googleToken, session, start, start + (session.end - session.start));
    } catch (error) {
      return fail("Could not move session", error);
    }
    setMovingId(null);
    setErrors([]);
    await refresh();
  }

  async function remove(id: string) {
    try {
      await deleteTaskWithEvents(googleToken, id);
    } catch (error) {
      return fail("Could not delete task", error);
    }
    setConfirmingId(null);
    setErrors([]);
    await refresh();
  }

  async function saveWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const startMin = timeToMinutes(String(fields.get("start")));
    const endMin = timeToMinutes(String(fields.get("end")));
    if (Number.isNaN(startMin) || Number.isNaN(endMin) || endMin <= startMin) {
      return setErrors(["Work hours must end after they start."]);
    }
    try {
      await saveWorkHours({ startMin, endMin });
    } catch (error) {
      return setErrors([`Could not save work hours: ${messageOf(error)}`]);
    }
    setErrors([]);
    await refresh();
  }

  return (
    <section className="tasks" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>

      {errors.map((message) => (
        <p role="alert" className="error" key={message}>
          {message}
        </p>
      ))}
      {reconnect && (
        <p className="reconnect">
          Google Calendar access is missing or has expired. <button type="button" onClick={onReconnect}>Reconnect Google</button>
        </p>
      )}
      {notices.map((message) => (
        <p role="status" className="notice" key={message}>
          {message}
        </p>
      ))}

      {data && (
        <form className="work-hours" aria-label="Work hours" onSubmit={saveWork}>
          <label>
            Work starts
            <input name="start" type="time" defaultValue={minutesToTime(data.work.startMin)} />
          </label>
          <label>
            Work ends
            <input name="end" type="time" defaultValue={minutesToTime(data.work.endMin)} />
          </label>
          <button type="submit">Save work hours</button>
        </form>
      )}

      <form className="task-form" aria-label="Add task" onSubmit={add}>
        <label>
          Title
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        </label>
        <label>
          Type
          <select
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as TaskType })}
          >
            {(Object.keys(TYPE_LABELS) as TaskType[]).map((type) => (
              <option key={type} value={type}>
                {TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Duration (minutes)
          <input
            inputMode="numeric"
            value={form.durationMin}
            onChange={(e) => setForm({ ...form, durationMin: e.target.value })}
          />
        </label>
        <label>
          Topic (optional)
          <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
        </label>
        <label>
          Deadline (optional)
          <input
            type="datetime-local"
            value={form.deadline}
            onChange={(e) => setForm({ ...form, deadline: e.target.value })}
          />
        </label>
        {form.type === "big" && (
          <label>
            Spread over (days)
            <input
              inputMode="numeric"
              value={form.spreadDays}
              onChange={(e) => setForm({ ...form, spreadDays: e.target.value })}
            />
          </label>
        )}
        {form.type !== "work_day" && (
          <label>
            Place
            <select
              value={form.conditionPlace}
              onChange={(e) => setForm({ ...form, conditionPlace: e.target.value as ConditionPlace })}
            >
              {(Object.keys(PLACE_LABELS) as ConditionPlace[]).map((place) => (
                <option key={place} value={place}>
                  {PLACE_LABELS[place]}
                </option>
              ))}
            </select>
          </label>
        )}
        <button type="submit">Add task</button>
      </form>

      {data === null ? (
        errors.length === 0 && <p className="status">Loading...</p>
      ) : data.tasks.length === 0 ? (
        <p className="status">No tasks yet.</p>
      ) : (
        <ul className="task-list">
          {sortTasks(data.tasks).map((task) => {
            const sessions = data.sessions
              .filter((session) => session.taskId === task.id)
              .sort((a, b) => a.start - b.start);
            return (
              <li key={task.id}>
                {editingId === task.id ? (
                  <div className="task-edit">
                    <label>
                      Title
                      <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
                    </label>
                    <label>
                      Duration (minutes)
                      <input
                        inputMode="numeric"
                        value={edit.durationMin}
                        onChange={(e) => setEdit({ ...edit, durationMin: e.target.value })}
                      />
                    </label>
                    <label>
                      Deadline (optional)
                      <input
                        type="datetime-local"
                        value={edit.deadline}
                        onChange={(e) => setEdit({ ...edit, deadline: e.target.value })}
                      />
                    </label>
                    <button type="button" onClick={() => saveEdit(task.id)}>
                      Save
                    </button>
                    <button type="button" onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="task-title">
                      <strong>{task.title}</strong>
                      {task.topic && <span className="topic"> {task.topic}</span>}
                    </div>
                    <div className="task-meta">
                      <span>{TYPE_LABELS[task.type]}</span>
                      {task.spreadDays !== null && <span> · spread {task.spreadDays} days</span>}
                      {task.deadline && <span> · due {new Date(task.deadline).toLocaleString()}</span>}
                      <span> · {STATUS_LABELS[taskStatus(task, sessions.length > 0)]}</span>
                    </div>
                    {sessions.map((session) =>
                      movingId === session.id ? (
                        <div className="session-edit" key={session.id}>
                          <label>
                            New start
                            <input
                              type="datetime-local"
                              value={moveValue}
                              onChange={(e) => setMoveValue(e.target.value)}
                            />
                          </label>
                          <button type="button" onClick={() => saveMove(session)}>
                            Save time
                          </button>
                          <button type="button" onClick={() => setMovingId(null)}>
                            Cancel
                          </button>
                        </div>
                      ) : task.type === "work_day" ? (
                        <div className="session" key={session.id}>
                          Work day: {describeSession(task, session)}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="session"
                          key={session.id}
                          aria-label={`Move session: ${describeSession(task, session)}`}
                          onClick={() => startMove(session)}
                        >
                          {describeSession(task, session)}
                        </button>
                      ),
                    )}
                    <div className="task-actions">
                      <button type="button" onClick={() => startEdit(task)}>
                        Edit
                      </button>
                      {task.held ? (
                        <button type="button" onClick={() => releaseTask(task.id)}>
                          Schedule
                        </button>
                      ) : (
                        <button type="button" onClick={() => unschedule(task.id)}>
                          Unschedule
                        </button>
                      )}
                      <button type="button" onClick={() => setConfirmingId(task.id)}>
                        Delete task
                      </button>
                    </div>
                    {confirmingId === task.id && (
                      <div className="task-confirm">
                        <span>Delete "{task.title}"?</span>
                        <button type="button" onClick={() => remove(task.id)}>
                          Yes, delete
                        </button>
                        <button type="button" onClick={() => setConfirmingId(null)}>
                          Cancel
                        </button>
                      </div>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Two stored deadlines match when they are the same instant, whatever their text form.
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}
