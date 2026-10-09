import { useEffect, useRef, useState, type FormEvent } from "react";
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
  deleteTask,
  getWorkHours,
  holdTask,
  insertSessions,
  insertTask,
  listSessions,
  listTasks,
  moveSession,
  releaseHold,
  saveWorkHours,
  updateTaskEdit,
  type StoredSession,
} from "./lib/tasksData";
import { schedule, type Placement, type WorkHours } from "./lib/scheduler";

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

export function Tasks() {
  // Holds what was last read from the database. Writes never change it locally; the data is reloaded after each save.
  const [data, setData] = useState<Loaded | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [form, setForm] = useState<TaskInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<TaskEditInput>({ title: "", durationMin: "", deadline: "" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveValue, setMoveValue] = useState("");
  // Refreshes run one at a time, so two runs never both place the same task (React StrictMode runs effects twice).
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Places unplaced, unheld tasks (SPEC 2.3), then shows what is stored. Never throws.
  async function placeAndLoad() {
    let placed: Placement[] = [];
    let titles = new Map<string, string>();
    try {
      const loaded = await loadAll();
      titles = new Map(loaded.tasks.map((task) => [task.id, task.title]));
      placed = schedule(loaded.tasks, loaded.sessions, Date.now(), loaded.work);
      if (placed.length > 0) await insertSessions(placed);
    } catch (error) {
      placed = [];
      setErrors([`Could not place tasks: ${messageOf(error)}`]);
    }
    try {
      setData(await loadAll());
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

  function refresh(): Promise<void> {
    queue.current = queue.current.then(placeAndLoad);
    return queue.current;
  }

  useEffect(() => {
    void refresh();
  }, []);

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
    try {
      await updateTaskEdit(id, parsed.value);
    } catch (error) {
      return setErrors([`Could not save task: ${messageOf(error)}`]);
    }
    setEditingId(null);
    setErrors([]);
    await refresh();
  }

  async function unschedule(id: string) {
    // Phase 3 hook: remove the task's calendar events from Google Calendar here, before the database change.
    try {
      await holdTask(id);
    } catch (error) {
      setErrors([`Could not unschedule task: ${messageOf(error)}`]);
      return refresh(); // the hold may have been saved; show what is stored
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
      await moveSession(session.id, start, start + (session.end - session.start));
    } catch (error) {
      return setErrors([`Could not move session: ${messageOf(error)}`]);
    }
    setMovingId(null);
    setErrors([]);
    await refresh();
  }

  async function remove(id: string) {
    // Phase 3 hook: remove the task's calendar events from Google Calendar here, before the database change.
    try {
      await deleteTask(id);
    } catch (error) {
      return setErrors([`Could not delete task: ${messageOf(error)}`]);
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
