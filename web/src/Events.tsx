import { useEffect, useState } from "react";
import { listAllEvents } from "./lib/calendar";
import { dayLabel } from "./lib/moodView";
import { deleteFixedEvent, fixedEventsFrom, groupByDay, type FixedEvent } from "./lib/fixedEvents";
import { dayBounds, formatClock } from "./lib/today";
import { FixedEventSheet } from "./FixedEventSheet";
import { Icon } from "./Icon";

// Fixed-time events in the next 30 days. Add and edit live here, not on Today (fixed events are stored in Google).
const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

function messageOf(e: unknown): string {
  return typeof e === "object" && e !== null && "message" in e ? String(e.message) : String(e);
}

async function loadUpcoming(token: string | null): Promise<FixedEvent[]> {
  const from = dayBounds(new Date()).start;
  const to = from + WINDOW_DAYS * DAY_MS;
  return fixedEventsFrom(await listAllEvents(token, from, to)).filter((f) => f.start >= from && f.start < to);
}

export function Events({
  googleToken,
  refreshTick,
  active,
  onReconnect,
}: {
  googleToken: string | null;
  refreshTick: number;
  active: boolean; // true while the Events tab is open; hidden tabs stay mounted but do not read Google
  onReconnect?: () => void;
}) {
  const [events, setEvents] = useState<FixedEvent[] | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The sheet: null when closed, { current: null } to add a new event.
  const [sheet, setSheet] = useState<{ current: FixedEvent | null } | null>(null);
  // Delete is confirmed inline on the card, as on Tasks; the id of the card asking.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function remove(event: FixedEvent) {
    setConfirmingId(null);
    setActionError(null);
    try {
      await deleteFixedEvent(googleToken, event);
      setReloadKey((k) => k + 1);
    } catch (e) {
      setActionError(messageOf(e));
    }
  }

  // Re-reads when the app comes back to the foreground, as Today does, so edits made in Google show up.
  useEffect(() => {
    if (!active) return;
    const onForeground = () => {
      if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
    };
    document.addEventListener("visibilitychange", onForeground);
    return () => document.removeEventListener("visibilitychange", onForeground);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let live = true;
    loadUpcoming(googleToken).then(
      (list) => {
        if (!live) return;
        setEvents(list);
        setError(null);
      },
      (e: unknown) => {
        if (!live) return;
        setEvents(null);
        setError(messageOf(e));
      },
    );
    return () => {
      live = false;
    };
  }, [active, googleToken, reloadKey, refreshTick]);

  return (
    <section className="page" aria-labelledby="events-heading">
      <header className="page-head row-between">
        <div>
          <h1 className="page-title" id="events-heading">
            Events
          </h1>
          <p className="page-sub">Next {WINDOW_DAYS} days</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="btn primary" onClick={() => setSheet({ current: null })}>
            <Icon name="plus" size={18} />
            Add event
          </button>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          Could not load events: {error}
        </p>
      )}
      {actionError && (
        <p className="error" role="alert">
          Could not delete the event: {actionError}
        </p>
      )}
      {events?.length === 0 && <p className="empty">No events in the next {WINDOW_DAYS} days.</p>}
      {events &&
        groupByDay(events).map((group) => (
          <section className="day-group" key={group.day} aria-label={dayLabel(new Date(group.day))}>
            <h2 className="day-title">{dayLabel(new Date(group.day))}</h2>
            <ul className="stack">
              {group.events.map((f) => (
                <li key={f.eventId} className="card task">
                  <div className="task-row">
                    <button
                      type="button"
                      className="task-top task-open"
                      onClick={() => {
                        setConfirmingId(null);
                        setSheet({ current: f });
                      }}
                    >
                      <span className="row-body">
                        <strong className="task-title">{f.title || "(no title)"}</strong>
                      </span>
                    </button>
                  </div>

                  <div className="pills">
                    <span className="pill time">
                      <Icon name="clock" size={13} />
                      {formatClock(f.start)}–{formatClock(f.end)}
                    </span>
                  </div>

                  <div className="task-actions">
                    <button
                      type="button"
                      className="chip"
                      onClick={() => {
                        setConfirmingId(null);
                        setSheet({ current: f });
                      }}
                    >
                      <Icon name="pencil" size={16} />
                      Edit
                    </button>
                    <button type="button" className="chip danger" onClick={() => setConfirmingId(f.eventId)}>
                      <Icon name="trash" size={16} />
                      Delete event
                    </button>
                  </div>

                  {confirmingId === f.eventId && (
                    <div className="confirm">
                      <span>Delete &ldquo;{f.title || "(no title)"}&rdquo;?</span>
                      <button type="button" className="btn danger small" onClick={() => remove(f)}>
                        Yes, delete
                      </button>
                      <button type="button" className="btn ghost small" onClick={() => setConfirmingId(null)}>
                        Keep it
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}

      {sheet && (
        <FixedEventSheet
          googleToken={googleToken}
          onReconnect={onReconnect}
          current={sheet.current}
          onClose={() => setSheet(null)}
          onSaved={() => {
            setSheet(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </section>
  );
}
