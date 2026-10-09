import { useEffect, useState, type FormEvent } from "react";
import { Link2, LogOut, Save } from "lucide-react";
import { Label } from "./ui";
import { Reminders } from "./Reminders";
import { formatTimeOfDay, parseTimeOfDay } from "./lib/reminders";
import { getWorkHours, saveWorkHours } from "./lib/tasksData";
import type { WorkHours } from "./lib/scheduler";

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
        <label>
          Work starts
          <input type="time" value={fields.start} disabled={!loaded} onChange={(e) => set("start")(e.target.value)} />
        </label>
        <label>
          Work ends
          <input type="time" value={fields.end} disabled={!loaded} onChange={(e) => set("end")(e.target.value)} />
        </label>
        <label>
          Lunch starts
          <input type="time" value={fields.lunchStart} disabled={!loaded} onChange={(e) => set("lunchStart")(e.target.value)} />
        </label>
        <label>
          Lunch ends
          <input type="time" value={fields.lunchEnd} disabled={!loaded} onChange={(e) => set("lunchEnd")(e.target.value)} />
        </label>
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

// All settings in one place (SPEC Settings): work hours, lunch, reminders, Google, and sign out.
export function Settings({ googleToken, onReconnect, onSignOut, email }: SettingsProps) {
  return (
    <div className="settings">
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
