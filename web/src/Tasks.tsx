import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  CalendarPlus,
  CalendarRange,
  CalendarX,
  Check,
  ChevronDown,
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
  dragShift,
  dropIndex,
  moveSteps,
  moveToSteps,
  ORDER_STEP,
  parseTaskEdit,
  parseTaskInput,
  slotTops,
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
import { insertTask, listSessions, listTasks, releaseHold, setPosition, updateTaskEdit, type StoredSession } from "./lib/tasksData";
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
import { DateTimeField, Dropdown, FieldLabel, Label, PriorityChoice, RowMenu, Sheet, type Option } from "./ui";

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

// A drag in progress: the row, where it started, the row heights, how far the pointer moved it, and where it lands.
interface DragState {
  id: string;
  from: number;
  heights: number[];
  startY: number;
  dy: number;
  to: number;
  settling: boolean;
}

// The time a drop takes to settle, in milliseconds. Matches the CSS transition on the dragged row.
const SETTLE_MS = 180;

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
  const [movingId, setMovingId] = useState<string | null>(null);
  const [moveValue, setMoveValue] = useState("");
  // Optimistic done state (SPEC 2.7): the row shows the new state at once; the save runs in the background.
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const activeListRef = useRef<HTMLUListElement>(null);

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
    // A new task goes to the end of the manual order.
    const last = Math.max(0, ...(data?.tasks.map((t) => t.position) ?? []));
    try {
      await insertTask(parsed.value, last + ORDER_STEP);
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

  // Done state as shown: a pending change wins until its save has finished.
  function isDone(task: Task): boolean {
    return pending[task.id] ?? task.done;
  }

  // Done or not done, optimistically (SPEC 2.7, assumed): the row moves at once, the save runs in the background, and a
  // failed save puts the row back and shows the error in the list (SPEC principles: no silent failures).
  async function toggleDone(task: Task) {
    const next = !isDone(task);
    setErrors([]);
    setPending((p) => ({ ...p, [task.id]: next }));
    try {
      await completeTask(googleToken, task.id, next);
    } catch (error) {
      setPending((p) => withoutKey(p, task.id));
      return fail(next ? `Could not complete "${task.title}"` : `Could not reopen "${task.title}"`, error);
    }
    // Reopening a task may place it again, so that path runs a placement; completing does not need one.
    if (next) await placementQueue(() => loadStored());
    else await refresh();
    setPending((p) => withoutKey(p, task.id));
  }

  // Manual order (SPEC 2.7, assumed): swaps the row with its neighbour. Display only; placement does not read it.
  async function moveTask(list: Task[], index: number, direction: -1 | 1) {
    try {
      for (const step of moveSteps(list, index, direction)) await setPosition(step.id, step.position);
    } catch (error) {
      return setErrors([`Could not move the task: ${messageOf(error)}`]);
    }
    setErrors([]);
    await loadStored();
  }

  // Writes the manual order for a drop from one index to another (display only).
  async function reorder(list: Task[], from: number, to: number) {
    try {
      for (const step of moveToSteps(list, from, to)) await setPosition(step.id, step.position);
    } catch (error) {
      return setErrors([`Could not move the task: ${messageOf(error)}`]);
    }
    setErrors([]);
    await loadStored();
  }

  // Drag by the grip (SPEC 2.7, assumed). Pointer capture keeps the events on the grip, so it works with a finger on iPhone.
  // The row follows the pointer; the rows in between move out of the way; a drop settles into the slot, then commits.
  function beginDrag(event: ReactPointerEvent<HTMLButtonElement>, from: number) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const rows = Array.from(activeListRef.current?.querySelectorAll<HTMLElement>(":scope > li") ?? []);
    const next: DragState = {
      id: active[from]?.id ?? "",
      from,
      heights: rows.map((row) => row.offsetHeight),
      startY: event.clientY,
      dy: 0,
      to: from,
      settling: false,
    };
    dragRef.current = next;
    setDrag(next);
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.settling) return;
    const dy = event.clientY - current.startY;
    const next = { ...current, dy, to: dropIndex(current.heights, current.from, dy) };
    dragRef.current = next;
    setDrag(next);
  }

  function endDrag() {
    const current = dragRef.current;
    if (!current || current.settling) return;
    const tops = slotTops(current.heights);
    const landing = current.to;
    // The dragged row settles into its new slot, then the order is written.
    const settled = { ...current, dy: (tops[landing] ?? 0) - (tops[current.from] ?? 0), settling: true };
    dragRef.current = settled;
    setDrag(settled);
    const order = active;
    window.setTimeout(() => {
      dragRef.current = null;
      setDrag(null);
      if (landing !== current.from) void reorder(order, current.from, landing);
    }, SETTLE_MS);
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

  const tasks = data?.tasks ?? [];
  // One list in manual order (SPEC 2.7, assumed). Tasks with the same position keep the deadline order.
  const active = sortTasks(tasks.filter((t) => !isDone(t))).sort((a, b) => a.position - b.position);
  const done = sortTasks(tasks.filter((t) => isDone(t)));
  const sessionsOf = (task: Task) => (data?.sessions ?? []).filter((session) => session.taskId === task.id).sort((a, b) => a.start - b.start);

  function renderRow(task: Task, list: Task[], index: number) {
    const isDoneNow = isDone(task);
    const sessions = sessionsOf(task);
    const status = taskStatus({ held: task.held, done: isDoneNow }, sessions.length > 0);
    const statusText = { placed: "Placed", unplaced: "Unplaced", unscheduled: "Unscheduled", done: "Done" }[status];
    const meta = [
      task.topic,
      TYPE_LABELS[task.type],
      task.spreadDays !== null ? `${task.spreadDays} days` : null,
      task.deadline ? `due ${formatDeadline(task.deadline)}` : null,
      statusText,
    ].filter((part): part is string => part !== null && part !== "");
    const items = [
      { key: "edit", label: "Edit", icon: Pencil, onSelect: () => openEdit(task) },
      ...(isDoneNow
        ? [{ key: "undo", label: "Mark not done", icon: Undo2, onSelect: () => toggleDone(task) }]
        : [
            ...(index > 0 ? [{ key: "up", label: "Move up", icon: ArrowUp, onSelect: () => moveTask(list, index, -1) }] : []),
            ...(index < list.length - 1 ? [{ key: "down", label: "Move down", icon: ArrowDown, onSelect: () => moveTask(list, index, 1) }] : []),
            task.held
              ? { key: "schedule", label: "Schedule", icon: CalendarPlus, onSelect: () => releaseTask(task.id) }
              : { key: "unschedule", label: "Unschedule", icon: CalendarX, onSelect: () => unschedule(task.id) },
          ]),
      { key: "delete", label: "Delete task", icon: Trash2, danger: true, onSelect: () => setConfirmingId(task.id) },
    ];
    // While a drag is on, the dragged row follows the pointer and the rows in between make room (display only).
    const moving = drag && !isDoneNow ? drag : null;
    const style =
      moving === null
        ? undefined
        : index === moving.from
          ? { transform: `translateY(${moving.dy}px)`, transition: moving.settling ? `transform ${SETTLE_MS}ms ease-out` : "none", zIndex: 5, position: "relative" as const }
          : { transform: `translateY(${dragShift(moving.heights, moving.from, moving.to, index)}px)`, transition: `transform ${SETTLE_MS}ms ease` };
    return (
      <li
        key={task.id}
        className={[isDoneNow ? "task-row done" : "task-row", moving?.id === task.id ? "dragging" : ""].filter(Boolean).join(" ")}
        data-order={isDoneNow ? undefined : index}
        style={style}
      >
        {task.priority !== "normal" && (
          <span className={`priority-edge ${task.priority}`} role="img" aria-label={`${PRIORITY_LABELS[task.priority]} priority`} />
        )}
        <button
          type="button"
          role="checkbox"
          aria-checked={isDoneNow}
          aria-label={`Complete ${task.title}`}
          className="check"
          onClick={() => toggleDone(task)}
        >
          {isDoneNow && <Check aria-hidden="true" size={16} strokeWidth={3} />}
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
        {!isDoneNow && (
          <button
            type="button"
            className="grip"
            aria-label={`Drag ${task.title} to reorder`}
            onPointerDown={(e) => beginDrag(e, index)}
            onPointerMove={moveDrag}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <GripVertical aria-hidden="true" size={20} strokeWidth={2} />
          </button>
        )}
        <RowMenu label={`Task actions: ${task.title}`} items={items} />
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
          {active.length > 0 && (
            <ul className="task-list" ref={activeListRef}>
              {active.map((t, i) => renderRow(t, active, i))}
            </ul>
          )}
          {done.length > 0 && (
            <details className="done-accordion">
              <summary>
                <span>Done ({done.length})</span>
                <ChevronDown aria-hidden="true" size={18} strokeWidth={2.25} className="chev" />
              </summary>
              <ul className="task-list">{done.map((t, i) => renderRow(t, done, i))}</ul>
            </details>
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
            <span id="type-label">
              <FieldLabel icon={Shapes}>Type</FieldLabel>
            </span>
            <Dropdown labelId="type-label" value={form.type} options={TYPE_OPTIONS} onChange={(type) => setForm({ ...form, type })} />
          </div>
          <label>
            <FieldLabel icon={Timer}>Duration (minutes)</FieldLabel>
            <input inputMode="numeric" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} />
          </label>
          {form.type === "big" && (
            <label>
              <FieldLabel icon={CalendarRange}>Spread over (days)</FieldLabel>
              <input inputMode="numeric" value={form.spreadDays} onChange={(e) => setForm({ ...form, spreadDays: e.target.value })} />
            </label>
          )}
          <details className="more-details">
            <summary>More details</summary>
            <label>
              <FieldLabel icon={Tag}>Topic (optional)</FieldLabel>
              <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} />
            </label>
            <div className="field">
              <span id="deadline-label">
                <FieldLabel icon={Flag}>Deadline (optional)</FieldLabel>
              </span>
              <DateTimeField
                labelId="deadline-label"
                value={form.deadline}
                onChange={(deadline) => setForm({ ...form, deadline })}
                clearLabel="Clear deadline"
              />
            </div>
            {form.type !== "work_day" && (
              <div className="field">
                <span id="place-label">
                  <FieldLabel icon={MapPin}>Place</FieldLabel>
                </span>
                <Dropdown
                  labelId="place-label"
                  value={form.conditionPlace}
                  options={PLACE_OPTIONS}
                  onChange={(conditionPlace) => setForm({ ...form, conditionPlace })}
                />
              </div>
            )}
            <div className="field">
              <span id="add-priority-label">
                <FieldLabel icon={Signal}>Priority</FieldLabel>
              </span>
              <PriorityChoice labelId="add-priority-label" value={form.priority} onChange={(priority) => setForm({ ...form, priority })} />
            </div>
          </details>
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
              <span id="edit-deadline-label">
                <FieldLabel icon={Flag}>Deadline (optional)</FieldLabel>
              </span>
              <DateTimeField
                labelId="edit-deadline-label"
                value={edit.deadline}
                onChange={(deadline) => setEdit({ ...edit, deadline })}
                clearLabel="Clear deadline"
              />
            </div>
            <div className="field">
              <span id="edit-priority-label">
                <FieldLabel icon={Signal}>Priority</FieldLabel>
              </span>
              <PriorityChoice labelId="edit-priority-label" value={edit.priority} onChange={(priority) => setEdit({ ...edit, priority })} />
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

// A copy of the map without one key.
function withoutKey(map: Record<string, boolean>, key: string): Record<string, boolean> {
  const next = { ...map };
  delete next[key];
  return next;
}
