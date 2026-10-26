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
import { insertTask, listSessions, listTasks, releaseHold, setDone, updateTaskEdit, type StoredSession } from "./lib/tasksData";
import { completeTask, deleteTaskWithEvents, moveSessionWithEvent, placeTasks, replacePlacement, unscheduleTask } from "./lib/calendarSync";
import { playDing } from "./lib/ding";
import { isGoogleAuthError } from "./lib/calendar";
import type { Placement } from "./lib/scheduler";
import { Icon, type IconName } from "./Icon";
import { Sheet } from "./Sheet";

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

const TYPE_ICONS: Record<TaskType, IconName> = {
  big: "mountain",
  work_day: "briefcase",
  short_fixed: "bolt",
};

const STATUS_LABELS = {
  placed: "Placed",
  unplaced: "Unplaced",
  unscheduled: "Unscheduled",
} as const;

const PLACE_LABELS: Record<ConditionPlace, string> = { any: "Anywhere", work: "Work", home: "Home" };
const PLACE_ICONS: Record<ConditionPlace, IconName> = { any: "globe", work: "building", home: "home" };

const emptyForm: TaskInput = {
  title: "",
  type: "short_fixed",
  durationMin: "",
  topic: "",
  deadline: "",
  spreadDays: "",
  conditionPlace: "any",
};

// What the sheet is showing. null means no sheet.
type SheetState = { mode: "add" } | { mode: "edit"; id: string } | null;

interface Loaded {
  tasks: Task[];
  sessions: StoredSession[];
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadAll(): Promise<Loaded> {
  const [tasks, sessions] = await Promise.all([listTasks(), listSessions()]);
  return { tasks, sessions };
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
  const [sheet, setSheet] = useState<SheetState>(null);
  const [form, setForm] = useState<TaskInput>(emptyForm);
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

  function openAdd() {
    setErrors([]);
    setForm(emptyForm);
    setSheet({ mode: "add" });
  }

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
    setSheet(null);
    await refresh();
  }

  function startEdit(task: Task) {
    setErrors([]);
    setEdit({
      title: task.title,
      durationMin: String(task.durationMin),
      deadline: toLocalInputValue(task.deadline),
    });
    setSheet({ mode: "edit", id: task.id });
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
    setSheet(null);
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

  // Removes the task's Google events and sessions, then marks it done. The ding plays once the save has gone through.
  async function complete(id: string) {
    try {
      await completeTask(googleToken, id);
    } catch (error) {
      return fail("Could not complete task", error);
    }
    playDing();
    setErrors([]);
    await refresh();
  }

  async function reopen(id: string) {
    try {
      await setDone(id, false);
    } catch (error) {
      return setErrors([`Could not reopen task: ${messageOf(error)}`]);
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

  const errorList = errors.map((message) => (
    <p role="alert" className="toast error" key={message}>
      {message}
    </p>
  ));
  const editingTask = sheet?.mode === "edit" ? data?.tasks.find((t) => t.id === sheet.id) : undefined;
  const active = sortTasks(data?.tasks.filter((t) => !t.done) ?? []);
  const done = data?.tasks.filter((t) => t.done) ?? [];

  // The confirm row for deleting a task. Shared by the active list and the Completed drawer.
  function deleteConfirm(task: Task) {
    if (confirmingId !== task.id) return null;
    return (
      <div className="confirm">
        <span>Delete &ldquo;{task.title}&rdquo;?</span>
        <button type="button" className="btn danger small" onClick={() => remove(task.id)}>
          Yes, delete
        </button>
        <button type="button" className="btn ghost small" onClick={() => setConfirmingId(null)}>
          Keep it
        </button>
      </div>
    );
  }

  return (
    <section className="page" aria-labelledby="tasks-heading">
      <header className="page-head row-between">
        <div>
          <h1 className="page-title" id="tasks-heading">
            Tasks
          </h1>
          {data && <p className="page-sub">{data.tasks.length === 0 ? "Nothing yet" : `${active.length} on your list`}</p>}
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn primary" onClick={openAdd}>
            <Icon name="plus" size={18} />
            New
          </button>
        </div>
      </header>

      {!sheet && errorList}
      {reconnect && (
        <p className="toast">
          Google Calendar access is missing or has expired.{" "}
          <button type="button" className="link" onClick={onReconnect}>
            Reconnect Google
          </button>
        </p>
      )}
      {notices.map((message) => (
        <p role="status" className="toast notice" key={message}>
          {message}
        </p>
      ))}

      {data === null ? (
        errors.length === 0 && <p className="status">Loading...</p>
      ) : data.tasks.length === 0 ? (
        <p className="empty">No tasks yet. Tap New to add the first one.</p>
      ) : (
        <>
          {active.length === 0 && <p className="empty">Nothing left to do. Nice.</p>}
          <ul className="stack">
          {active.map((task) => {
            const sessions = data.sessions
              .filter((session) => session.taskId === task.id)
              .sort((a, b) => a.start - b.start);
            const status = taskStatus(task, sessions.length > 0);
            return (
              <li key={task.id} className="card task">
                <div className="task-row">
                  <button type="button" className="task-top task-open" onClick={() => startEdit(task)}>
                    <span className={`card-icon tint-${task.type}`}>
                      <Icon name={TYPE_ICONS[task.type]} />
                    </span>
                    <span className="row-body">
                      <strong className="task-title">{task.title}</strong>
                      {task.topic && <span className="meta">{task.topic}</span>}
                    </span>
                  </button>
                  <button type="button" className="done-button" aria-label={`Mark done: ${task.title}`} onClick={() => complete(task.id)}>
                    <Icon name="check" size={20} />
                  </button>
                </div>

                <div className="pills">
                  <span className="pill">{TYPE_LABELS[task.type]}</span>
                  {task.spreadDays !== null && <span className="pill">{task.spreadDays} days</span>}
                  {task.deadline && (
                    <span className="pill">
                      <Icon name="calendar" size={13} />
                      {new Date(task.deadline).toLocaleDateString([], { day: "numeric", month: "short" })}
                    </span>
                  )}
                  <span className={`pill status status-${status}`}>{STATUS_LABELS[status]}</span>
                </div>

                {sessions.length > 0 && (
                <details className="sessions-drawer">
                <summary>{sessions.length === 1 ? "1 session" : `${sessions.length} sessions`}</summary>
                {sessions.map((session) =>
                  movingId === session.id ? (
                    <div className="session-edit" key={session.id}>
                      <input
                        type="datetime-local"
                        aria-label="New start"
                        value={moveValue}
                        onChange={(e) => setMoveValue(e.target.value)}
                      />
                      <button type="button" className="btn primary small" onClick={() => saveMove(session)}>
                        Save time
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => setMovingId(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : task.type === "work_day" ? (
                    <div className="session" key={session.id}>
                      <Icon name="briefcase" size={16} />
                      {describeSession(task, session)}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="session"
                      key={session.id}
                      aria-label={`Move session: ${describeSession(task, session)}`}
                      onClick={() => startMove(session)}
                    >
                      <Icon name="calendar" size={16} />
                      {describeSession(task, session)}
                    </button>
                  ),
                )}
                </details>
                )}

                <div className="task-actions">
                  <button type="button" className="chip" onClick={() => startEdit(task)}>
                    <Icon name="pencil" size={16} />
                    Edit
                  </button>
                  {task.held ? (
                    <button type="button" className="chip" onClick={() => releaseTask(task.id)}>
                      <Icon name="bolt" size={16} />
                      Schedule
                    </button>
                  ) : (
                    <button type="button" className="chip" onClick={() => unschedule(task.id)}>
                      <Icon name="minus" size={16} />
                      Unschedule
                    </button>
                  )}
                  <button type="button" className="chip danger" onClick={() => setConfirmingId(task.id)}>
                    <Icon name="trash" size={16} />
                    Delete task
                  </button>
                </div>

                {deleteConfirm(task)}
              </li>
            );
          })}
          </ul>

          {done.length > 0 && (
            <details className="done-drawer">
              <summary>Completed ({done.length})</summary>
              <ul className="stack">
                {done.map((task) => (
                  <li key={task.id} className="card task done-item">
                    <div className="task-row">
                      <span className="done-title">{task.title}</span>
                    </div>
                    <div className="task-actions">
                      <button type="button" className="chip" onClick={() => reopen(task.id)}>
                        <Icon name="refresh" size={16} />
                        Reopen
                      </button>
                      <button type="button" className="chip danger" onClick={() => setConfirmingId(task.id)}>
                        <Icon name="trash" size={16} />
                        Delete task
                      </button>
                    </div>
                    {deleteConfirm(task)}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}

      {sheet?.mode === "add" && (
        <Sheet title="Add task" onClose={() => setSheet(null)}>
          {errorList}
          <form className="form" aria-label="Add task" onSubmit={add}>
            <label className="field">
              <span>Title</span>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </label>

            <div className="field">
              <span>Type</span>
              <div className="segmented" role="radiogroup" aria-label="Type">
                {(Object.keys(TYPE_LABELS) as TaskType[]).map((type) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={form.type === type}
                    key={type}
                    className="seg"
                    onClick={() => setForm({ ...form, type })}
                  >
                    <Icon name={TYPE_ICONS[type]} />
                    {TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Duration (minutes)</span>
                <input inputMode="numeric" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
              </label>
              {form.type === "big" && (
                <label className="field">
                  <span>Spread over (days)</span>
                  <input inputMode="numeric" value={form.spreadDays} onChange={(e) => setForm({ ...form, spreadDays: e.target.value })} />
                </label>
              )}
            </div>

            {form.type !== "work_day" && (
              <div className="field">
                <span>Place</span>
                <div className="segmented" role="radiogroup" aria-label="Place">
                  {(Object.keys(PLACE_LABELS) as ConditionPlace[]).map((place) => (
                    <button
                      type="button"
                      role="radio"
                      aria-checked={form.conditionPlace === place}
                      key={place}
                      className="seg"
                      onClick={() => setForm({ ...form, conditionPlace: place })}
                    >
                      <Icon name={PLACE_ICONS[place]} />
                      {PLACE_LABELS[place]}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="field">
              <span>Topic (optional)</span>
              <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </label>
            <label className="field">
              <span>Deadline (optional)</span>
              <input type="datetime-local" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} />
            </label>

            <button type="submit" className="btn primary block">
              <Icon name="plus" size={18} />
              Add task
            </button>
          </form>
        </Sheet>
      )}

      {sheet?.mode === "edit" && editingTask && (
        <Sheet title="Edit task" onClose={() => setSheet(null)}>
          {errorList}
          <form
            className="form"
            aria-label="Edit task"
            onSubmit={(e) => {
              e.preventDefault();
              void saveEdit(editingTask.id);
            }}
          >
            <label className="field">
              <span>Title</span>
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </label>
            <label className="field">
              <span>Duration (minutes)</span>
              <input inputMode="numeric" value={edit.durationMin} onChange={(e) => setEdit({ ...edit, durationMin: e.target.value })} />
            </label>
            <label className="field">
              <span>Deadline (optional)</span>
              <input type="datetime-local" value={edit.deadline} onChange={(e) => setEdit({ ...edit, deadline: e.target.value })} />
            </label>
            <p className="meta">Changing the time moves the task&rsquo;s sessions to a new slot.</p>
            <button type="submit" className="btn primary block">
              Save changes
            </button>
          </form>
        </Sheet>
      )}

    </section>
  );
}

// Two stored deadlines match when they are the same instant, whatever their text form.
function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}
