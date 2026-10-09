import { useEffect, useState } from "react";
import { formatTimeOfDay, parseTimeOfDay } from "./lib/reminders";
import { DEFAULT_CONTACT_REMINDER_MIN, getContactReminderMin, saveContactReminderMin } from "./lib/remindersData";
import { deviceStatus, needsHomeScreen, turnOff, turnOn } from "./lib/push";
import { Label } from "./ui";
import { Bell, BellOff, Clock } from "lucide-react";

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : typeof error === "object" && error !== null && "message" in error ? String(error.message) : String(error);
}

// Notification settings (SPEC 5). Shows what is stored: this device's state and the saved contact reminder time.
export function Reminders() {
  const [enabled, setEnabled] = useState<boolean | null>(null); // null until read
  const [storedMin, setStoredMin] = useState<number | null>(null);
  const [draft, setDraft] = useState(formatTimeOfDay(DEFAULT_CONTACT_REMINDER_MIN));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iosHint = needsHomeScreen();

  useEffect(() => {
    let live = true;
    deviceStatus().then(
      (on) => live && setEnabled(on),
      (e: unknown) => {
        if (live) setError(`Could not read notification status: ${messageOf(e)}`);
      },
    );
    getContactReminderMin().then(
      (min) => {
        if (!live) return;
        setStoredMin(min);
        setDraft(formatTimeOfDay(min));
      },
      (e: unknown) => {
        if (live) setError(`Could not read the contact reminder time: ${messageOf(e)}`);
      },
    );
    return () => {
      live = false;
    };
  }, []);

  // The tap handler calls turnOn synchronously, so the permission prompt runs inside the gesture.
  async function toggle() {
    if (enabled === null) return;
    if (!enabled && iosHint) {
      setError("Add this app to your Home Screen first (iOS 16.4 or newer), then turn on notifications from the Home Screen app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (enabled) await turnOff();
      else await turnOn();
      setEnabled(await deviceStatus());
    } catch (e) {
      setError(`Could not ${enabled ? "turn off" : "turn on"} notifications: ${messageOf(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function saveTime() {
    const minutes = parseTimeOfDay(draft);
    if (minutes === null) {
      setError("Enter the contact reminder time as HH:MM, for example 19:00.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await saveContactReminderMin(minutes);
      setStoredMin(minutes);
    } catch (e) {
      setError(`Could not save the contact reminder time: ${messageOf(e)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2>Reminders</h2>
      {enabled === null ? (
        <p className="status">Loading notification status...</p>
      ) : (
        <p className="status">Notifications on this device: {enabled ? "on" : "off"}</p>
      )}
      {iosHint && <p className="muted">On iPhone, notifications work only after you add this app to the Home Screen (iOS 16.4 or newer).</p>}
      <button type="button" disabled={busy || enabled === null} onClick={toggle}>
        <Label icon={enabled ? BellOff : Bell}>{enabled ? "Turn off notifications" : "Turn on notifications"}</Label>
      </button>

      <div className="person-form">
        <label>
          Contact reminder time
          <input type="time" value={draft} onChange={(e) => setDraft(e.target.value)} />
        </label>
        <button type="button" disabled={busy} onClick={saveTime}><Label icon={Clock}>Set time</Label></button>
      </div>
      {storedMin !== null && <p className="status">Saved contact reminder time: {formatTimeOfDay(storedMin)}</p>}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
