import { useEffect, useState, type FormEvent } from "react";
import type { CalendarInfo } from "./lib/calendarEvents";
import { isGoogleAuthError } from "./lib/calendar";
import { createFixedEvent, deleteFixedEvent, getCalendars, parseLocalInput, toLocalInput, updateFixedEvent, type FixedEvent } from "./lib/fixedEvents";
import { Sheet } from "./Sheet";

// Add or edit a fixed-time event: title, start, duration, category (a calendar). Google is called before the sheet closes.
const HALF_HOUR = 30 * 60_000;

function messageOf(e: unknown): string {
  return typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e);
}

// The next half hour, the default start for a new event.
function nextHalfHour(now: number): number {
  return Math.ceil(now / HALF_HOUR) * HALF_HOUR;
}

export function FixedEventSheet({
  googleToken,
  current,
  onSaved,
  onClose,
  onReconnect,
}: {
  googleToken: string | null;
  current: FixedEvent | null;
  onSaved: () => void;
  onClose: () => void;
  onReconnect?: () => void;
}) {
  const [calendars, setCalendars] = useState<CalendarInfo[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // 401 or 403: the Google grant is missing or predates the calendar list scope. Offer Reconnect instead of a raw error.
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [title, setTitle] = useState(current?.title ?? "");
  const [start, setStart] = useState(toLocalInput(current?.start ?? nextHalfHour(Date.now())));
  const [duration, setDuration] = useState(String(current ? Math.round((current.end - current.start) / 60_000) : 60));
  const [calendarId, setCalendarId] = useState(current?.calendarId ?? "primary");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    let live = true;
    getCalendars(googleToken).then(
      (list) => {
        if (!live) return;
        setCalendars(list);
        // A new event goes to the primary calendar when it is writable, otherwise the first category.
        if (!current && !list.some((c) => c.id === "primary") && list[0]) setCalendarId(list[0].id);
      },
      (e: unknown) => {
        if (!live) return;
        setLoadError(messageOf(e));
        setNeedsReconnect(isGoogleAuthError(e));
      },
    );
    return () => {
      live = false;
    };
  }, [googleToken, current]);

  const input = { title, start: parseLocalInput(start), durationMinutes: Number(duration), calendarId };

  async function save(event: FormEvent) {
    event.preventDefault();
    if (Number.isNaN(input.start)) return setError("Choose a start time.");
    setSaving(true);
    setError(null);
    try {
      if (current) await updateFixedEvent(googleToken, current, input);
      else await createFixedEvent(googleToken, input);
      onSaved();
    } catch (e) {
      setError(messageOf(e));
      setNeedsReconnect(isGoogleAuthError(e));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!current) return;
    setSaving(true);
    setError(null);
    try {
      await deleteFixedEvent(googleToken, current);
      onSaved();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet title={current ? "Edit event" : "Add event"} onClose={onClose}>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loadError && (
        <p className="error" role="alert">
          Could not load categories: {loadError}
        </p>
      )}
      {needsReconnect && onReconnect && (
        <button type="button" className="btn primary block" onClick={onReconnect}>
          Reconnect Google
        </button>
      )}
      <form className="form" aria-label={current ? "Edit event" : "Add event"} onSubmit={save}>
        <label className="field">
          <span>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="field">
          <span>Start</span>
          <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="field">
          <span>Duration (minutes)</span>
          <input type="number" inputMode="numeric" min={5} step={1} value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
        <label className="field">
          <span>Category</span>
          <select value={calendarId} onChange={(e) => setCalendarId(e.target.value)} disabled={calendars === null}>
            {calendars?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.summary}
              </option>
            ))}
            {calendars === null && <option value={calendarId}>Loading…</option>}
          </select>
        </label>

        <button type="submit" className="btn primary block" disabled={saving}>
          Save
        </button>
      </form>

      {current &&
        (confirmingDelete ? (
          <div className="row-actions">
            <button type="button" className="btn danger block" onClick={remove} disabled={saving}>
              Delete event
            </button>
            <button type="button" className="btn ghost block" onClick={() => setConfirmingDelete(false)}>
              Keep it
            </button>
          </div>
        ) : (
          <button type="button" className="btn danger block" onClick={() => setConfirmingDelete(true)}>
            Delete…
          </button>
        ))}
    </Sheet>
  );
}
