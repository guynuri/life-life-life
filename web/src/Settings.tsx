import { useEffect, useState, type FormEvent } from "react";
import { getWorkHours, saveWorkHours } from "./lib/tasksData";
import type { WorkHours } from "./lib/scheduler";
import { Reminders } from "./Reminders";
import { Icon } from "./Icon";
import { applyTheme, saveTheme, type Theme } from "./lib/theme";

const THEMES: { value: Theme; label: string; icon: "today" | "moon" }[] = [
  { value: "light", label: "Light", icon: "today" },
  { value: "dark", label: "Dark", icon: "moon" },
];

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Parses "HH:MM" from a time input into minutes after midnight. Empty input gives NaN.
function timeToMinutes(value: string): number {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hours = NaN, minutes = NaN] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

// Settings (SPEC 2.4, 5): work hours and lunch for the scheduler, then the notification settings.
// Shows what is stored; a failed read or save is shown here.
export function Settings() {
  const [hours, setHours] = useState<WorkHours | null>(null); // null until read
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // main.tsx applied the theme before the first render, so the page already shows it.
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.dataset.theme === "dark" ? "dark" : "light"));

  function choose(next: Theme) {
    applyTheme(next);
    saveTheme(next);
    setTheme(next);
  }

  useEffect(() => {
    let live = true;
    getWorkHours().then(
      (stored) => {
        if (live) setHours(stored);
      },
      (e: unknown) => {
        if (live) setError(`Could not read settings: ${messageOf(e)}`);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const next: WorkHours = {
      startMin: timeToMinutes(String(fields.get("start"))),
      endMin: timeToMinutes(String(fields.get("end"))),
      lunchStartMin: timeToMinutes(String(fields.get("lunchStart"))),
      lunchEndMin: timeToMinutes(String(fields.get("lunchEnd"))),
    };
    if (Object.values(next).some(Number.isNaN)) return setError("Enter every time.");
    if (next.endMin <= next.startMin) return setError("Work must end after it starts.");
    if (next.lunchEndMin <= next.lunchStartMin) return setError("Lunch must end after it starts.");

    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await saveWorkHours(next);
      setHours(next);
      setSaved(true);
    } catch (e) {
      setError(`Could not save settings: ${messageOf(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="settings-heading">
      <header className="page-head">
        <h1 className="page-title" id="settings-heading">
          Settings
        </h1>
      </header>

      {error && (
        <p role="alert" className="toast error">
          {error}
        </p>
      )}

      <h2>Appearance</h2>
      <div className="segmented" role="radiogroup" aria-label="Theme">
        {THEMES.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={theme === t.value}
            className="seg"
            onClick={() => choose(t.value)}
          >
            <Icon name={t.icon} />
            {t.label}
          </button>
        ))}
      </div>

      <h2>Work hours</h2>
      <p className="meta">Work is Sunday to Thursday. Lunch is not work time, and it counts as home.</p>
      {hours === null ? (
        <p className="status">Loading...</p>
      ) : (
        <form className="form" aria-label="Work hours" onSubmit={save}>
          <div className="form-grid">
            <label className="field">
              <span>Work starts</span>
              <input name="start" type="time" defaultValue={minutesToTime(hours.startMin)} />
            </label>
            <label className="field">
              <span>Work ends</span>
              <input name="end" type="time" defaultValue={minutesToTime(hours.endMin)} />
            </label>
            <label className="field">
              <span>Lunch starts</span>
              <input name="lunchStart" type="time" defaultValue={minutesToTime(hours.lunchStartMin)} />
            </label>
            <label className="field">
              <span>Lunch ends</span>
              <input name="lunchEnd" type="time" defaultValue={minutesToTime(hours.lunchEndMin)} />
            </label>
          </div>
          <button type="submit" className="btn primary block" disabled={busy}>
            {busy ? "Saving..." : "Save settings"}
          </button>
          {saved && <p role="status" className="notice">Settings saved.</p>}
        </form>
      )}

      <Reminders />
    </section>
  );
}
