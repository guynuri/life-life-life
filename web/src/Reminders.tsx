import { useEffect, useState } from "react";
import { formatTimeOfDay, parseTimeOfDay } from "./lib/reminders";
import { DEFAULT_CONTACT_REMINDER_MIN, getContactReminderMin, saveContactReminderMin } from "./lib/remindersData";
import { deviceStatus, needsHomeScreen, turnOff, turnOn } from "./lib/push";
import { Icon } from "./Icon";

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
    <article className="card">
      <h2 className="card-title">
        <span className="card-icon tint-butter">
          <Icon name="bell" />
        </span>
        Reminders
      </h2>
      <div className="row">
        <div className="row-body">
          <strong>Notifications</strong>
          <span className="meta">
            {enabled === null ? "Checking..." : enabled ? "On for this device" : "Off for this device"}
          </span>
        </div>
        <button
          type="button"
          className={`btn ${enabled ? "ghost" : "primary"}`}
          disabled={busy || enabled === null}
          onClick={toggle}
        >
          {enabled ? "Turn off" : "Turn on"}
        </button>
      </div>
      {iosHint && <p className="meta">On iPhone, notifications work only after you add this app to the Home Screen (iOS 16.4 or newer).</p>}

      <div className="row">
        <div className="row-body">
          <strong>Reach-out reminder</strong>
          <span className="meta">{storedMin !== null ? `Saved for ${formatTimeOfDay(storedMin)}` : "Loading..."}</span>
        </div>
        <div className="time-field">
          <input
            aria-label="Contact reminder time"
            type="time"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button type="button" className="btn ghost" disabled={busy} onClick={saveTime}>
            Set
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
