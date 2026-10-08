import { useEffect, useState, type FormEvent } from "react";
import type { Place } from "../../lib/conditions";
import { supabase } from "../../lib/supabase";
import type { TaskKind } from "../../lib/scheduler";

type Row = {
  id: string;
  title: string;
  kind: TaskKind;
  duration_minutes: number | null;
  deadline: string | null;
  conditions: { place?: Place };
};

const KIND_LABEL: Record<TaskKind, string> = {
  big: "Big (several sessions)",
  work_day: "Work day",
  scheduled_small: "Short fixed item",
};

export function TasksView() {
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const { data, error } = await supabase!
        .from("tasks")
        .select("id, title, kind, duration_minutes, deadline, conditions")
        .order("deadline", { ascending: true, nullsFirst: false });
      if (error) setError(error.message);
      else setRows((data ?? []) as Row[]);
    } catch (e) {
      setError(messageOf(e));
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    setError(null);
    try {
      const { error } = await supabase!.from("tasks").delete().eq("id", id);
      if (error) setError(error.message);
      else await load();
    } catch (e) {
      setError(messageOf(e));
    }
  }

  return (
    <section>
      <h2>Tasks</h2>
      {error && <p className="status">{error}</p>}
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}>
            <div>
              <strong>{r.title}</strong>
              <div className="status">
                {KIND_LABEL[r.kind]}
                {r.duration_minutes ? ` · ${r.duration_minutes} min` : ""}
                {r.conditions.place ? ` · ${r.conditions.place}` : ""}
                {r.deadline ? ` · due ${new Date(r.deadline).toLocaleString()}` : ""}
              </div>
            </div>
            <button type="button" onClick={() => remove(r.id)}>
              Delete
            </button>
          </li>
        ))}
      </ul>
      <AddTask onAdded={load} onError={setError} />
    </section>
  );
}

function AddTask({ onAdded, onError }: { onAdded: () => void; onError: (msg: string | null) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<TaskKind>("scheduled_small");
  const [minutes, setMinutes] = useState("60");
  const [deadline, setDeadline] = useState("");
  const [place, setPlace] = useState<Place | "">("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const { error } = await supabase!.from("tasks").insert({
        title: title.trim(),
        kind,
        duration_minutes: Number(minutes),
        deadline: deadline ? new Date(deadline).toISOString() : null,
        conditions: place ? { place } : {},
      });
      if (error) {
        onError(error.message);
        return;
      }
      setTitle("");
      setDeadline("");
      onAdded();
    } catch (err) {
      onError(messageOf(err));
    }
  }

  return (
    <form className="add-task" onSubmit={submit}>
      <input
        aria-label="Title"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
        {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      <input
        type="number"
        min="5"
        step="5"
        aria-label="Duration in minutes"
        value={minutes}
        onChange={(e) => setMinutes(e.target.value)}
        required
      />
      <input type="datetime-local" aria-label="Deadline" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      <select aria-label="Place" value={place} onChange={(e) => setPlace(e.target.value as Place | "")}>
        <option value="">Any place</option>
        <option value="work">At work</option>
        <option value="home">At home</option>
      </select>
      <button type="submit">Add task</button>
    </form>
  );
}

function messageOf(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
