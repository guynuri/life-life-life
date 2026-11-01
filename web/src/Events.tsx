import { useEffect, useState } from "react";
import { listAllEvents } from "./lib/calendar";
import { dayLabel } from "./lib/moodView";
import { fixedEventsFrom, type FixedEvent } from "./lib/fixedEvents";
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

export function Events({ googleToken, refreshTick }: { googleToken: string | null; refreshTick: number }) {
  const [events, setEvents] = useState<FixedEvent[] | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  // The sheet: null when closed, { current: null } to add a new event.
  const [sheet, setSheet] = useState<{ current: FixedEvent | null } | null>(null);

  useEffect(() => {
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
  }, [googleToken, reloadKey, refreshTick]);

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
      {events?.length === 0 && <p className="empty">No events in the next {WINDOW_DAYS} days.</p>}
      {events && events.length > 0 && (
        <ul className="stack">
          {events.map((f) => (
            <li key={f.eventId}>
              <button type="button" className="row today-fixed" onClick={() => setSheet({ current: f })}>
                <div className="row-body">
                  <strong>{f.title || "(no title)"}</strong>
                  <span className="meta">{dayLabel(new Date(f.start))}</span>
                </div>
                <span className="pill time">
                  <Icon name="clock" size={14} />
                  {formatClock(f.start)}–{formatClock(f.end)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sheet && (
        <FixedEventSheet
          googleToken={googleToken}
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
