import { useEffect, useState, type FormEvent } from "react";
import { Link2, LogOut, Save } from "lucide-react";
import { FieldLabel, Label, TimeField } from "./ui";
import { applyTheme, readTheme, writeTheme, type ThemeChoice } from "./lib/theme";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { Reminders } from "./Reminders";
import { formatTimeOfDay, parseTimeOfDay } from "./lib/reminders";
import { getWorkHours, saveWorkHours } from "./lib/tasksData";
import type { WorkHours } from "./lib/scheduler";
import { Sunrise, Sunset, Utensils, UtensilsCrossed } from "lucide-react";

interface SettingsProps {
  googleToken: string | null; // from the Supabase session; null when Google access is missing
  onReconnect: () => void;
  onSignOut: () => void;
  email: string;
}

interface Notice {
  kind: "ok" | "error";
  text: string;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Work hours and lunch (SPEC 2.4). Shows what is stored; every save reports success or the error.
function WorkHoursForm() {
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fields, setFields] = useState({ start: "", end: "", lunchStart: "", lunchEnd: "" });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getWorkHours().then(
      (hours) => {
        if (!live) return;
        setFields({
          start: formatTimeOfDay(hours.startMin),
          end: formatTimeOfDay(hours.endMin),
          lunchStart: formatTimeOfDay(hours.lunchStartMin),
          lunchEnd: formatTimeOfDay(hours.lunchEndMin),
        });
        setLoaded(true);
      },
      (e: unknown) => {
        if (live) setLoadError(`Could not read work hours: ${messageOf(e)}`);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startMin = parseTimeOfDay(fields.start);
    const endMin = parseTimeOfDay(fields.end);
    const lunchStartMin = parseTimeOfDay(fields.lunchStart);
    const lunchEndMin = parseTimeOfDay(fields.lunchEnd);
    if (startMin === null || endMin === null || lunchStartMin === null || lunchEndMin === null) {
      return setNotice({ kind: "error", text: "Enter every time as HH:MM, for example 09:00." });
    }
    if (endMin <= startMin) return setNotice({ kind: "error", text: "Work must end after it starts." });
    if (lunchEndMin <= lunchStartMin) return setNotice({ kind: "error", text: "Lunch must end after it starts." });
    if (lunchStartMin < startMin || lunchEndMin > endMin) {
      return setNotice({ kind: "error", text: "Lunch must fall inside work hours." });
    }
    const hours: WorkHours = { startMin, endMin, lunchStartMin, lunchEndMin };
    setBusy(true);
    try {
      await saveWorkHours(hours);
      setNotice({ kind: "ok", text: "Saved work hours." });
    } catch (e) {
      setNotice({ kind: "error", text: `Could not save work hours: ${messageOf(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const set = (name: keyof typeof fields) => (value: string) => setFields({ ...fields, [name]: value });

  return (
    <section aria-labelledby="work-heading">
      <h2 id="work-heading">Work hours</h2>
      {loadError && (
        <p className="error" role="alert">
          {loadError}
        </p>
      )}
      <form className="form-grid" aria-label="Work hours" onSubmit={save}>
        <div className="field">
          <span id="start-label"><FieldLabel icon={Sunrise}>Work starts</FieldLabel></span>
          <TimeField labelId="start-label" value={fields.start} disabled={!loaded} onChange={set("start")} />
        </div>
        <div className="field">
          <span id="end-label"><FieldLabel icon={Sunset}>Work ends</FieldLabel></span>
          <TimeField labelId="end-label" value={fields.end} disabled={!loaded} onChange={set("end")} />
        </div>
        <div className="field">
          <span id="lunch-start-label"><FieldLabel icon={UtensilsCrossed}>Lunch starts</FieldLabel></span>
          <TimeField labelId="lunch-start-label" value={fields.lunchStart} disabled={!loaded} onChange={set("lunchStart")} />
        </div>
        <div className="field">
          <span id="lunch-end-label"><FieldLabel icon={Utensils}>Lunch ends</FieldLabel></span>
          <TimeField labelId="lunch-end-label" value={fields.lunchEnd} disabled={!loaded} onChange={set("lunchEnd")} />
        </div>
        <button type="submit" disabled={!loaded || busy}>
          <Label icon={Save}>Save work hours</Label>
        </button>
      </form>
      {notice && (
        <p className={notice.kind === "ok" ? "success" : "error"} role={notice.kind === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      )}
    </section>
  );
}

const themeOptions: { id: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { id: "system", label: "System", icon: Monitor },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

// Appearance (SPEC Visual direction). The choice applies at once and is saved on this device.
function AppearanceForm() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme());
  const [notice, setNotice] = useState<Notice | null>(null);

  function pick(next: ThemeChoice) {
    setChoice(next);
    applyTheme(next);
    const saved = writeTheme(next);
    const name = themeOptions.find((o) => o.id === next)?.label ?? "System";
    setNotice(
      saved
        ? { kind: "ok", text: `Theme set to ${name}.` }
        : { kind: "error", text: "Could not save the theme. It lasts until you reload." },
    );
  }

  return (
    <section aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Appearance</h2>
      <div className="segmented" role="group" aria-label="Theme">
        {themeOptions.map((o) => (
          <button key={o.id} type="button" aria-pressed={choice === o.id} onClick={() => pick(o.id)}>
            <Label icon={o.icon}>{o.label}</Label>
          </button>
        ))}
      </div>
      {notice && (
        <p className={notice.kind === "ok" ? "success" : "error"} role={notice.kind === "ok" ? "status" : "alert"}>
          {notice.text}
        </p>
      )}
    </section>
  );
}

// All settings in one place (SPEC Settings): work hours, lunch, reminders, Google, and sign out.
export function Settings({ googleToken, onReconnect, onSignOut, email }: SettingsProps) {
  return (
    <div className="settings">
      <AppearanceForm />
      <WorkHoursForm />
      <Reminders />
      <section aria-labelledby="google-heading">
        <h2 id="google-heading">Google Calendar</h2>
        {googleToken ? (
          <p className="success">Connected. Sessions are placed on your primary calendar.</p>
        ) : (
          <p className="error" role="alert">
            Not connected. Sessions cannot be placed until you reconnect.
          </p>
        )}
        <button type="button" onClick={onReconnect}>
          <Label icon={Link2}>Reconnect Google</Label>
        </button>
      </section>
      <section aria-labelledby="account-heading">
        <h2 id="account-heading">Account</h2>
        <p className="status">Signed in as {email}</p>
        <button type="button" className="secondary" onClick={onSignOut}>
          <Label icon={LogOut}>Sign out</Label>
        </button>
      </section>
    </div>
  );
}
