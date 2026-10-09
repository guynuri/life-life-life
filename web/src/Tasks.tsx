import { useEffect, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  Check,
  Flag,
  GripVertical,
  Link2,
  MapPin,
  PenLine,
  Pencil,
  Plus,
  Shapes,
  Signal,
  Tag,
  Timer,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { placementQueue } from "./lib/serialQueue";
import {
  parsePriority,
  parseTaskEdit,
  parseTaskInput,
  PRIORITIES,
  sortTasks,
  taskStatus,
  toLocalInputValue,
  type ConditionPlace,
  type Priority,
  type Task,
  type TaskEditInput,
  type TaskInput,
  type TaskType,
} from "./lib/tasks";
import { insertTask, listSessions, listTasks, releaseHold, updateTaskEdit, setPriority, type StoredSession } from "./lib/tasksData";
import {
  completeTask,
  deleteTaskWithEvents,
  moveSessionWithEvent,
  placeTasks,
  replacePlacement,
  unscheduleTask,
} from "./lib/calendarSync";
import { isGoogleAuthError } from "./lib/calendar";
import type { Placement } from "./lib/scheduler";
import { DateTimeField, Dropdown, FieldLabel, Label, RowMenu, Sheet, type Option } from "./ui";

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

const PLACE_LABELS: Record<ConditionPlace, string> = { any: "Any", work: "Work", home: "Home" };
const PRIORITY_LABELS: Record<Priority, string> = { high: "High", normal: "Normal", low: "Low" };
const TYPE_OPTIONS: Option<TaskType>[] = (Object.keys(TYPE_LABELS) as TaskType[]).map((value) => ({ value, label: TYPE_LABELS[value] }));
const PLACE_OPTIONS: Option<ConditionPlace>[] = (Object.keys(PLACE_LABELS) as ConditionPlace[]).map((value) => ({ value, label: PLACE_LABELS[value] }));
const PRIORITY_OPTIONS: Option<Priority>[] = PRIORITIES.map((value) => ({ value, label: PRIORITY_LABELS[value] }));

const emptyForm: TaskInput = {
  title: "",
  type: "short_fixed",
  durationMin: "",
  topic: "",
  deadline: "",
  spreadDays: "",
  conditionPlace: "any",
  priority: "normal",
};

// The sheet is either adding a task, or editing one (only title, duration, deadline and priority change; SPEC 2.7).
type SheetState = { mode: "add" } | { mode: "edit"; task: Task } | null;

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

function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return Date.parse(a) === Date.parse(b);
}

export function Tasks({ googleToken, onReconnect, refreshTick }: TasksProps) {
  // Holds what was last read from the database. Writes never change it locally; the data is reloaded after each save.
  const [data, setData] = useState<Loaded | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [reconnect, setReconnect] = useState(false);
  const [notices, setNotices] = useState<string[]>([]);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [form, setForm] = useState<TaskInput>(emptyForm);
  const [edit, setEdit] = useState<TaskEditInput>({ title: "", durationMin: "", deadline: "", priority: "normal" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveValue, setMoveValue] = useState("");
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropPriority, setDropPriority] = useState<Priority | null>(null);

  // Shows a failed action. Google auth failures also offer Reconnect. Never throws.
  function fail(message: string, error: unknown) {
    setErrors([`${message}: ${messageOf(error)}`]);
    setReconnect(isGoogleAuthError(error));
  }

  // Syncs with Google, places unplaced, unheld, not-done tasks (SPEC 2.3), then shows what is stored. Never throws.
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
    setForm(emptyForm);
    setErrors([]);
    setSheet({ mode: "add" });
  }

  function openEdit(task: Task) {
    setErrors([]);
    setEdit({
      title: task.title,
      durationMin: String(task.durationMin),
      deadline: toLocalInputValue(task.deadline),
      priority: task.priority,
    });
    setSheet({ mode: "edit", task });
  }

  async function addTask(event: FormEvent) {
    event.preventDefault();
    const parsed = parseTaskInput(form);
    if (!parsed.ok) return setErrors(parsed.errors);
    try {
      await insertTask(parsed.value);
    } catch (error) {
      return setErrors([`Could not save task: ${messageOf(error)}`]);
    }
    setSheet(null);
    setErrors([]);
    await refresh();
  }

  async function saveEdit(event: FormEvent, task: Task) {
    event.preventDefault();
    const parsed = parseTaskEdit(edit);
    if (!parsed.ok) return setErrors(parsed.errors);
    const timeChanged = task.durationMin !== parsed.value.durationMin || !sameInstant(task.deadline, parsed.value.deadline);
    try {
      // A changed duration or deadline replaces the placement: Google events go first, then the sessions (SPEC 2.5).
      if (timeChanged) await replacePlacement(googleToken, task.id);
      await updateTaskEdit(task.id, parsed.value);
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

  async function releaseTask(id: string) {
    try {
      await releaseHold(id);
    } catch (error) {
      return setErrors([`Could not schedule task: ${messageOf(error)}`]);
    }
    setErrors([]);
    await refresh();
  }

  async function toggleDone(task: Task) {
    try {
      await completeTask(googleToken, task.id, !task.done);
    } catch (error) {
      return fail(task.done ? "Could not mark the task not done" : "Could not complete the task", error);
    }
    setErrors([]);
    await refresh();
  }

  async function changePriority(id: string, priority: Priority) {
    try {
      await setPriority(id, priority);
    } catch (error) {
      return setErrors([`Could not change priority: ${messageOf(error)}`]);
    }
    setErrors([]);
    await loadStored();
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

  // Drag between priority sections (SPEC 2.7, assumed). Pointer events work for touch and mouse; the grip has touch-action none.
  function startDrag(event: ReactPointerEvent<HTMLButtonElement>, task: Task) {
    event.preventDefault();
    setDragId(task.id);
    setDropPriority(task.priority);
    const onMove = (e: PointerEvent) => {
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const section = under?.closest<HTMLElement>("[data-priority]");
      setDropPriority((section?.dataset.priority as Priority | undefined) ?? null);
    };
    const onUp = (e: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const under = document.elementFromPoint(e.clientX, e.clientY);
      const target = under?.closest<HTMLElement>("[data-priority]")?.dataset.priority;
      const next = target === undefined ? null : parsePriority(target);
      setDragId(null);
      setDropPriority(null);
      if (next !== null && next !== task.priority) void changePriority(task.id, next);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const tasks = data?.tasks ?? [];
  const active = sortTasks(tasks.filter((t) => !t.done));
  const done = sortTasks(tasks.filter((t) => t.done));
  const sessionsOf = (task: Task) => (data?.sessions ?? []).filter((s) => s.taskId === task.id).sort((a, b) => a.start - b.start);

  function renderRow(task: Task) {
    const sessions = sessionsOf(task);
    const status = taskStatus(task, sessions.length > 0);
    const statusText = { placed: "Placed", unplaced: "Unplaced", unscheduled: "Unscheduled", done: "Done" }[status];
    const meta = [
      task.topic,
      TYPE_LABELS[task.type],
      task.spreadDays !== null ? `${task.spreadDays} days` : null,
      task.deadline ? `due ${formatDeadline(task.deadline)}` : null,
      statusText,
    ].filter((part): part is string => part !== null && part !== "");
    return (
      <li key={task.id} className={task.done ? "task-row done" : "task-row"}>
        <button
          type="button"
          role="checkbox"
          aria-checked={task.done}
          aria-label={`Complete ${task.title}`}
          className="check"
          onClick={() => toggleDone(task)}
        >
          {task.done && <Check aria-hidden="true" size={16} strokeWidth={3} />}
        </button>
        <div className="task-body">
          <p className="task-title">{task.title}</p>
          <p className="task-meta">{meta.join(" · ")}</p>
          {sessions.map((session) =>
            movingId === session.id ? (
              <div className="session-edit" key={session.id}>
                <span id={`move-${session.id}`}>
                  <FieldLabel icon={CalendarClock}>New start</FieldLabel>
                </span>
                <DateTimeField labelId={`move-${session.id}`} value={moveValue} onChange={setMoveValue} clearLabel="Clear" />
                <button type="button" onClick={() => saveMove(session)}>
                  <Label icon={Check}>Save time</Label>
                </button>
                <button type="button" className="secondary" onClick={() => setMovingId(null)}>
                  <Label icon={X}>Cancel</Label>
                </button>
              </div>
            ) : task.type === "work_day" ? (
              <p className="session" key={session.id}>
                Work day: {describeSession(task, session)}
              </p>
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
        </div>
        {!task.done && (
          <button
            type="button"
            className="grip"
            aria-label={`Drag ${task.title} to another priority`}
            onPointerDown={(e) => startDrag(e, task)}
          >
            <GripVertical aria-hidden="true" size={20} strokeWidth={2} />
          </button>
        )}
        <RowMenu
          label={`Task actions: ${task.title}`}
          items={[
            { key: "edit", label: "Edit", icon: Pencil, onSelect: () => openEdit(task) },
            task.done
              ? { key: "undo", label: "Mark not done", icon: Undo2, onSelect: () => toggleDone(task) }
              : task.held
                ? { key: "schedule", label: "Schedule", icon: CalendarPlus, onSelect: () => releaseTask(task.id) }
                : { key: "unschedule", label: "Unschedule", icon: CalendarX, onSelect: () => unschedule(task.id) },
            { key: "delete", label: "Delete task", icon: Trash2, danger: true, onSelect: () => setConfirmingId(task.id) },
          ]}
        />
        {confirmingId === task.id && (
          <div className="task-confirm">
            <span>Delete "{task.title}"?</span>
            <button type="button" className="danger" onClick={() => remove(task.id)}>
              <Label icon={Trash2}>Yes, delete</Label>
            </button>
            <button type="button" className="secondary" onClick={() => setConfirmingId(null)}>
              <Label icon={X}>Cancel</Label>
            </button>
          </div>
        )}
      </li>
    );
  }

  function renderSection(priority: Priority, rows: Task[]) {
    const showEmpty = dragId !== null && rows.length === 0;
    if (rows.length === 0 && !showEmpty) return null;
    return (
      <section
        key={priority}
        className={dropPriority === priority ? "priority-section drop" : "priority-section"}
        data-priority={priority}
        aria-labelledby={`priority-${priority}`}
      >
        <h3 id={`priority-${priority}`}>
          {PRIORITY_LABELS[priority]} <span className="count">{rows.length}</span>
        </h3>
        {rows.length > 0 ? <ul className="task-list">{rows.map(renderRow)}</ul> : <p className="status">Drop a task here.</p>}
      </section>
    );
  }

  return (
    <section className="tasks page-tasks" aria-labelledby="tasks-heading">
      <div className="page-head">
        <h2 id="tasks-heading">Tasks</h2>
        <button type="button" className="fab" aria-label="Add task" onClick={openAdd}>
          <Plus aria-hidden="true" size={24} strokeWidth={2.5} />
        </button>
      </div>

      {!sheet && errors.map((message) => (
        <p role="alert" className="error" key={message}>
          {message}
        </p>
      ))}
      {reconnect && (
        <p className="reconnect">
          Google Calendar access is missing or has expired.{" "}
          <button type="button" onClick={onReconnect}>
            <Label icon={Link2}>Reconnect Google</Label>
          </button>
        </p>
      )}
      {notices.map((message) => (
        <p role="status" className="notice" key={message}>
          {message}
        </p>
      ))}

      {data === null ? (
        errors.length === 0 && <p className="status">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="status">No tasks yet. Use the plus button to add one.</p>
      ) : (
        <>
          {PRIORITIES.map((priority) => renderSection(priority, active.filter((t) => t.priority === priority)))}
          {done.length > 0 && (
            <div className="done-toggle">
              <button type="button" className="secondary" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>
                <Label icon={Check}>{showDone ? "Hide done" : `Show done (${done.length})`}</Label>
              </button>
            </div>
          )}
          {showDone && done.length > 0 && (
            <section className="priority-section done-section" aria-labelledby="done-heading">
              <h3 id="done-heading">Done <span className="count">{done.length}</span></h3>
              <ul className="task-list">{done.map(renderRow)}</ul>
            </section>
          )}
        </>
      )}

      <Sheet open={sheet?.mode === "add"} title="Add task" onClose={() => setSheet(null)}>
        <form className="task-form" aria-label="Add task form" onSubmit={addTask}>
          <label>
            <FieldLabel icon={PenLine}>Title</FieldLabel>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </label>
          <div className="field">
            <span id="type-label"><FieldLabel icon={Shapes}>Type</FieldLabel></span>
            <Dropdown labelId="type-label" value={form.type} options={TYPE_OPTIONS} onChange={(type) => setForm({ ...form, type })} />
          </div>
          <label>
            <FieldLabel icon={Timer}>Duration (minutes)</FieldLabel>
            <input inputMode="numeric" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
          </label>
          <label>
            <FieldLabel icon={Tag}>Topic (optional)</FieldLabel>
            <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
          </label>
          <div className="field">
            <span id="deadline-label"><FieldLabel icon={Flag}>Deadline (optional)</FieldLabel></span>
            <DateTimeField
              labelId="deadline-label"
              value={form.deadline}
              onChange={(deadline) => setForm({ ...form, deadline })}
              clearLabel="Clear deadline"
            />
          </div>
          {form.type === "big" && (
            <label>
              <FieldLabel icon={CalendarRange}>Spread over (days)</FieldLabel>
              <input inputMode="numeric" value={form.spreadDays} onChange={(e) => setForm({ ...form, spreadDays: e.target.value })} />
            </label>
          )}
          {form.type !== "work_day" && (
            <div className="field">
              <span id="place-label"><FieldLabel icon={MapPin}>Place</FieldLabel></span>
              <Dropdown
                labelId="place-label"
                value={form.conditionPlace}
                options={PLACE_OPTIONS}
                onChange={(conditionPlace) => setForm({ ...form, conditionPlace })}
              />
            </div>
          )}
          <div className="field">
            <span id="add-priority-label"><FieldLabel icon={Signal}>Priority</FieldLabel></span>
            <Dropdown
              labelId="add-priority-label"
              value={form.priority}
              options={PRIORITY_OPTIONS}
              onChange={(priority) => setForm({ ...form, priority })}
            />
          </div>
          {errors.map((message) => (
            <p role="alert" className="error" key={message}>
              {message}
            </p>
          ))}
          <button type="submit">
            <Label icon={Plus}>Add task</Label>
          </button>
        </form>
      </Sheet>

      <Sheet open={sheet?.mode === "edit"} title="Edit task" onClose={() => setSheet(null)}>
        {sheet?.mode === "edit" && (
          <form className="task-form" aria-label="Edit task form" onSubmit={(e) => saveEdit(e, sheet.task)}>
            <p className="status">
              {TYPE_LABELS[sheet.task.type]}
              {sheet.task.spreadDays !== null ? `, spread ${sheet.task.spreadDays} days` : ""}
              {sheet.task.conditionPlace !== "any" && sheet.task.type !== "work_day" ? `, place ${PLACE_LABELS[sheet.task.conditionPlace]}` : ""}
              {sheet.task.topic ? `, topic ${sheet.task.topic}` : ""}. Type, spread, place and topic are set when the task is created.
            </p>
            <label>
              <FieldLabel icon={PenLine}>Title</FieldLabel>
              <input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
            </label>
            <label>
              <FieldLabel icon={Timer}>Duration (minutes)</FieldLabel>
              <input inputMode="numeric" value={edit.durationMin} onChange={(e) => setEdit({ ...edit, durationMin: e.target.value })} />
            </label>
            <div className="field">
              <span id="edit-deadline-label"><FieldLabel icon={Flag}>Deadline (optional)</FieldLabel></span>
              <DateTimeField
                labelId="edit-deadline-label"
                value={edit.deadline}
                onChange={(deadline) => setEdit({ ...edit, deadline })}
                clearLabel="Clear deadline"
              />
            </div>
            <div className="field">
              <span id="edit-priority-label"><FieldLabel icon={Signal}>Priority</FieldLabel></span>
              <Dropdown
                labelId="edit-priority-label"
                value={edit.priority}
                options={PRIORITY_OPTIONS}
                onChange={(priority) => setEdit({ ...edit, priority })}
              />
            </div>
            {errors.map((message) => (
              <p role="alert" className="error" key={message}>
                {message}
              </p>
            ))}
            <button type="submit">
              <Label icon={Check}>Save</Label>
            </button>
          </form>
        )}
      </Sheet>
    </section>
  );
}

