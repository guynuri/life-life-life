import { useEffect, useState, type FormEvent } from "react";
import type { Place } from "../../lib/conditions";
import { supabase } from "../../lib/supabase";
import type { TaskKind } from "../../lib/scheduler";

type Row = {
  id: string;
  title: string;
  kind: TaskKind;
  topic: string | null;
  duration_minutes: number | null;
  spread_days: number | null;
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
        .select("id, title, kind, topic, duration_minutes, spread_days, deadline, conditions")
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
                {r.topic ? `${r.topic} · ` : ""}
                {KIND_LABEL[r.kind]}
                {r.spread_days ? ` · over ${r.spread_days} days` : ""}
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
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState("60");
  const [spreadDays, setSpreadDays] = useState("");
  const [deadline, setDeadline] = useState("");
  const [place, setPlace] = useState<Place | "">("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    onError(null);
    try {
      const { error } = await supabase!.from("tasks").insert({
        title: title.trim(),
        topic: topic.trim() || null,
        kind,
        duration_minutes: Number(minutes),
        spread_days: kind === "big" ? Number(spreadDays) : null,
        deadline: deadline ? new Date(deadline).toISOString() : null,
        conditions: place ? { place } : {},
      });
      if (error) {
        onError(error.message);
        return;
      }
      setTitle("");
      setTopic("");
      setSpreadDays("");
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
      <input aria-label="Topic" placeholder="Topic (optional)" value={topic} onChange={(e) => setTopic(e.target.value)} />
      <select aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as TaskKind)}>
        {(Object.keys(KIND_LABEL) as TaskKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </select>
      {kind === "big" && (
        <input
          type="number"
          min="1"
          step="1"
          aria-label="Spread over (days)"
          placeholder="Spread over (days)"
          value={spreadDays}
          onChange={(e) => setSpreadDays(e.target.value)}
          required
        />
      )}
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
