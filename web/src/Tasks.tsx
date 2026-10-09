import { useEffect, useState, type FormEvent } from "react";
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
import { deleteTask, holdTask, insertTask, listTasks, updateTaskEdit } from "./lib/tasksData";

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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function Tasks() {
  // Holds what was last read from the database. Writes never change it locally; the list is reloaded after each save.
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [form, setForm] = useState<TaskInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<TaskEditInput>({ title: "", durationMin: "", deadline: "" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  async function reload() {
    try {
      setTasks(await listTasks());
    } catch (error) {
      setErrors([`Could not load tasks: ${messageOf(error)}`]);
    }
  }

  useEffect(() => {
    void reload();
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
    await reload();
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
    await reload();
  }

  async function unschedule(id: string) {
    // Phase 3 hook: remove the task's calendar event from Google Calendar here, before the database change.
    try {
      await holdTask(id);
    } catch (error) {
      return setErrors([`Could not unschedule task: ${messageOf(error)}`]);
    }
    setErrors([]);
    await reload();
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
    await reload();
  }

  return (
    <section className="tasks" aria-labelledby="tasks-heading">
      <h2 id="tasks-heading">Tasks</h2>

      {errors.map((message) => (
        <p role="alert" className="error" key={message}>
          {message}
        </p>
      ))}

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

      {tasks === null ? (
        errors.length === 0 && <p className="status">Loading...</p>
      ) : tasks.length === 0 ? (
        <p className="status">No tasks yet.</p>
      ) : (
        <ul className="task-list">
          {sortTasks(tasks).map((task) => (
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
                    <span> · {STATUS_LABELS[taskStatus(task)]}</span>
                  </div>
                  <div className="task-actions">
                    <button type="button" onClick={() => startEdit(task)}>
                      Edit
                    </button>
                    <button type="button" onClick={() => unschedule(task.id)}>
                      Unschedule
                    </button>
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
          ))}
        </ul>
      )}
    </section>
  );
}
