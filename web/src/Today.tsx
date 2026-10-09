import { useEffect, useState } from "react";
import { dueNow, type Person } from "./lib/people";
import { listPeople } from "./lib/peopleStore";
import { dayKey, dayLabel, MOOD_COLORS, type MoodColor } from "./lib/moodView";
import { loadMoods } from "./lib/moodStore";
import { dayBounds, formatSessionTime, greeting, nextSession, todaySessions, type TodaySession } from "./lib/today";
import { listSessions, listTasks } from "./lib/tasksData";
import { onDataChanged } from "./lib/dataEvents";

// Each part loads on its own, so a failed read shows an error for that part only (SPEC principles).
// data is undefined while loading and null after a failed read.
interface Part<T> {
  data: T | null | undefined;
  error: string | null;
}

function messageOf(e: unknown): string {
  return typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e);
}

function usePart<T>(load: () => Promise<T>, reloadKey: number): Part<T> {
  const [part, setPart] = useState<Part<T>>({ data: undefined, error: null });
  useEffect(() => {
    let live = true;
    load().then(
      (data) => live && setPart({ data, error: null }),
      (e: unknown) => live && setPart({ data: null, error: messageOf(e) }),
    );
    return () => {
      live = false;
    };
    // load is recreated each render; reloadKey is the trigger.
  }, [reloadKey]);
  return part;
}

async function loadSessions(): Promise<TodaySession[]> {
  const [tasks, sessions] = await Promise.all([listTasks(), listSessions()]);
  return todaySessions(sessions, tasks, dayBounds(new Date()));
}

async function loadDue(): Promise<Person[]> {
  return dueNow(await listPeople(), Date.now());
}

async function loadMood(): Promise<MoodColor | null> {
  const today = dayKey(new Date());
  return (await loadMoods(today, today)).get(today) ?? null;
}

// Today is mounted even when hidden, so it reloads on data changes and when its tab becomes active (SPEC Pages).
export function Today({ refreshTick, active }: { refreshTick: number; active: boolean }) {
  // Re-reads when the app comes back to the foreground, so a new day or a moved session shows up.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => onDataChanged(() => setReloadKey((k) => k + 1)), []);
  useEffect(() => {
    if (active) setReloadKey((k) => k + 1);
  }, [active]);
  useEffect(() => {
    const onForeground = () => {
      if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onForeground);
    return () => document.removeEventListener("visibilitychange", onForeground);
  }, []);

  // The shell Refresh bumps refreshTick after it has placed; the parts reload on either trigger.
  const key = reloadKey + refreshTick;
  const sessions = usePart(loadSessions, key);
  const due = usePart(loadDue, key);
  const mood = usePart(loadMood, key);

  return (
    <section className="today page-today">
      <div className="hero">
        <h2>{greeting(new Date().getHours())}</h2>
        {sessions.data ? (
          (() => {
            const next = nextSession(sessions.data, Date.now());
            if (!next) return <p>No more sessions today.</p>;
            const inProgress = next.start <= Date.now();
            return (
              <p>
                {inProgress ? "Now: " : "Up next: "}
                <strong>{next.title}</strong>, {formatSessionTime(next.start, next.end)}
              </p>
            );
          })()
        ) : sessions.error ? (
          <p>Could not load sessions.</p>
        ) : (
          <p>Loading...</p>
        )}
      </div>
      <p className="status">{dayLabel(new Date())}</p>

      <h3>Sessions</h3>
      {sessions.error && (
        <p className="error" role="alert">
          Could not load sessions: {sessions.error}
        </p>
      )}
      {sessions.data?.length === 0 && <p className="status">No sessions today.</p>}
      {sessions.data && sessions.data.length > 0 && (
        <div className="list">
          {sessions.data.map((s) => (
            <div className="today-row today-session" key={s.id}>
              <div className="row-title">{s.title}</div>
              <div className="status">
                {formatSessionTime(s.start, s.end)}
                {s.topic && ` · ${s.topic}`}
              </div>
            </div>
          ))}
        </div>
      )}

      <h3>Due</h3>
      {due.error && (
        <p className="error" role="alert">
          Could not load people: {due.error}
        </p>
      )}
      {due.data?.length === 0 && <p className="status">Nobody is due.</p>}
      {due.data && due.data.length > 0 && (
        <div className="list">
          {due.data.map((p) => (
            <div className="today-row today-person" key={p.id}>
              <div className="row-title">{p.name}</div>
              <div className="status">Tier {p.tier}</div>
            </div>
          ))}
        </div>
      )}

      <h3>Mood</h3>
      {mood.error && (
        <p className="error" role="alert">
          Could not load mood: {mood.error}
        </p>
      )}
      {mood.data === null && !mood.error && <p className="status">Not set</p>}
      {mood.data && (
        <p className="today-mood">
          <span className="today-dot" style={{ background: `rgb(${MOOD_COLORS[mood.data].join(", ")})` }} />
          {mood.data}
        </p>
      )}
    </section>
  );
}
