import { useEffect, useState } from "react";
import { dueNow, initialsOf, type Person } from "./lib/people";
import { listPeople } from "./lib/peopleStore";
import { dayKey, dayLabel, EMOTIONS, type MoodEntry } from "./lib/moodView";
import { loadMoods } from "./lib/moodStore";
import { dayBounds, formatClock, formatSessionTime, todaySessions, type TodaySession } from "./lib/today";
import { listSessions, listTasks } from "./lib/tasksData";
import { listAllEvents } from "./lib/calendar";
import { fixedEventsFrom, type FixedEvent } from "./lib/fixedEvents";
import { Icon } from "./Icon";

// Each part loads on its own, so a failed read shows an error for that part only (SPEC principles).
// data is undefined while loading and null after a failed read.
interface Part<T> {
  data: T | null | undefined;
  error: string | null;
}

function messageOf(e: unknown): string {
  return typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e);
}

function usePart<T>(load: () => Promise<T>, deps: unknown[]): Part<T> {
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
    // load is recreated each render; deps are the triggers.
  }, deps);
  return part;
}

// Fixed events that start today, from Google (they live only there).
async function loadFixed(token: string | null): Promise<FixedEvent[]> {
  const bounds = dayBounds(new Date());
  const fixed = fixedEventsFrom(await listAllEvents(token, bounds.start, bounds.end));
  return fixed.filter((f) => f.start >= bounds.start && f.start < bounds.end);
}

async function loadSessions(): Promise<TodaySession[]> {
  const [tasks, sessions] = await Promise.all([listTasks(), listSessions()]);
  return todaySessions(sessions, tasks, dayBounds(new Date()));
}

async function loadDue(): Promise<Person[]> {
  return dueNow(await listPeople(), Date.now());
}

async function loadMood(): Promise<MoodEntry | null> {
  const today = dayKey(new Date());
  return (await loadMoods(today, today)).get(today) ?? null;
}

export function Today({ refreshTick, googleToken }: { refreshTick: number; googleToken: string | null }) {
  // Re-reads when the app comes back to the foreground, so a new day or a moved session shows up.
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const onForeground = () => {
      if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onForeground);
    return () => document.removeEventListener("visibilitychange", onForeground);
  }, []);

  // The shell Refresh bumps refreshTick after it has placed; the parts reload on either trigger.
  const key = reloadKey + refreshTick;
  const sessions = usePart(loadSessions, [key]);
  const fixed = usePart(() => loadFixed(googleToken), [key, googleToken]);
  const due = usePart(loadDue, [key]);
  const mood = usePart(loadMood, [key]);

  return (
    <section className="page today">
      <header className="page-head">
        <h1 className="page-title">Today</h1>
        <p className="page-sub">{dayLabel(new Date())}</p>
      </header>

      <article className="card">
        <h2 className="card-title">
          <a className="card-link" href="#/tasks">
            <span className="card-icon tint-lilac">
              <Icon name="calendar" />
            </span>
            Sessions
            <Icon name="chevronRight" size={18} />
          </a>
        </h2>
        {sessions.error && (
          <p className="error" role="alert">
            Could not load sessions: {sessions.error}
          </p>
        )}
        {sessions.data?.length === 0 && <p className="empty">No sessions today.</p>}
        {sessions.data && sessions.data.length > 0 && (
          <ul className="stack">
            {sessions.data.map((s) => (
              <li className="row today-session" key={s.id}>
                <div className="row-body">
                  <strong>{s.title}</strong>
                  {s.topic && <span className="meta">{s.topic}</span>}
                </div>
                <span className="pill time">
                  <Icon name="clock" size={14} />
                  {formatSessionTime(s.start, s.end)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card">
        <h2 className="card-title">
          <a className="card-link" href="#/events">
            <span className="card-icon tint-lilac">
              <Icon name="calendar" />
            </span>
            Fixed events
            <Icon name="chevronRight" size={18} />
          </a>
        </h2>
        {fixed.error && (
          <p className="error" role="alert">
            Could not load fixed events: {fixed.error}
          </p>
        )}
        {fixed.data?.length === 0 && <p className="empty">No fixed events today.</p>}
        {fixed.data && fixed.data.length > 0 && (
          <ul className="stack">
            {fixed.data.map((f) => (
              <li className="row today-fixed" key={f.eventId}>
                <div className="row-body">
                  <strong>{f.title || "(no title)"}</strong>
                </div>
                <span className="pill time">
                  <Icon name="clock" size={14} />
                  {formatClock(f.start)}–{formatClock(f.end)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card">
        <h2 className="card-title">
          <a className="card-link" href="#/people">
            <span className="card-icon tint-bubble">
              <Icon name="people" />
            </span>
            Due
            <Icon name="chevronRight" size={18} />
          </a>
        </h2>
        {due.error && (
          <p className="error" role="alert">
            Could not load people: {due.error}
          </p>
        )}
        {due.data?.length === 0 && <p className="empty">Nobody is due.</p>}
        {due.data && due.data.length > 0 && (
          <ul className="stack">
            {due.data.map((p) => (
              <li className="row today-person" key={p.id}>
                <span className={`avatar tier-${p.tier}`} aria-hidden="true">
                  {initialsOf(p.name)}
                </span>
                <div className="row-body">
                  <strong>{p.name}</strong>
                  <span className="meta">Tier {p.tier}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </article>

      <article className="card">
        <h2 className="card-title">
          <a className="card-link" href="#/mood">
            <span className="card-icon tint-mint">
              <Icon name="mood" />
            </span>
            Mood
            <Icon name="chevronRight" size={18} />
          </a>
        </h2>
        {mood.error && (
          <p className="error" role="alert">
            Could not load mood: {mood.error}
          </p>
        )}
        {mood.data === null && !mood.error && <p className="empty">Not set</p>}
        {mood.data && (
          <p className="today-mood">
            <span className="mood-blob" style={{ background: `rgb(${EMOTIONS[mood.data.emotion].join(", ")})` }} />
            <span className="capitalize">{mood.data.emotion}</span>
          </p>
        )}
        {mood.data?.note && <p className="meta">{mood.data.note}</p>}
      </article>
    </section>
  );
}
