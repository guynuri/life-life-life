// Pure Google Calendar rules (SPEC 1). No DOM, no network. Times are epoch ms.

export interface GoogleEvent {
  id: string;
  status?: string;
  transparency?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  extendedProperties?: { private?: Record<string, string> };
}

export interface Span {
  start: number;
  end: number;
}

export interface EventBody {
  summary: string;
  start: { dateTime: string };
  end: { dateTime: string };
  extendedProperties: { private: { taskId: string; sessionId: string } };
}

export type SyncDecision = { kind: "keep" } | { kind: "move"; start: number; end: number } | { kind: "deleted" };

// Google wants RFC 3339 without milliseconds.
export function rfc3339(time: number): string {
  return new Date(time).toISOString().replace(/\.\d{3}Z$/, "Z");
}

// One event per session, titled with the task, linked back to the task and session.
export function eventBody(task: { id: string; title: string }, session: { id: string } & Span): EventBody {
  return {
    summary: task.title,
    start: { dateTime: rfc3339(session.start) },
    end: { dateTime: rfc3339(session.end) },
    extendedProperties: { private: { taskId: task.id, sessionId: session.id } },
  };
}

// The span of a timed event, or null for all-day events (they carry no time slot).
export function eventSpan(event: GoogleEvent): Span | null {
  if (!event.start?.dateTime || !event.end?.dateTime) return null;
  return { start: Date.parse(event.start.dateTime), end: Date.parse(event.end.dateTime) };
}

// Busy times for the scheduler: timed events that are not cancelled and not marked free (transparent).
export function busySpans(events: readonly GoogleEvent[]): Span[] {
  const spans: Span[] = [];
  for (const event of events) {
    if (event.status === "cancelled" || event.transparency === "transparent") continue;
    const span = eventSpan(event);
    if (span) spans.push(span);
  }
  return spans;
}

// Sync outcome for one stored session (SPEC 1). `event` is null when Google no longer has it.
// A moved event moves the session, even if the new time breaks the task's Condition. Other edits are ignored.
export function decideSync(session: Span, event: GoogleEvent | null): SyncDecision {
  if (event === null || event.status === "cancelled") return { kind: "deleted" };
  const span = eventSpan(event);
  if (span === null || (span.start === session.start && span.end === session.end)) return { kind: "keep" };
  return { kind: "move", start: span.start, end: span.end };
}

// Busy times must cover every window where an unplaced task could land (SPEC 2.2, 1). A big task's window is
// now to the earlier of its deadline and now + spread days; other tasks use their deadline, or 14 days without one.
export interface WindowTask {
  type: string;
  deadline: string | null;
  spreadDays: number | null;
}

const WINDOW_DAY_MS = 86_400_000;

export function busyHorizon(tasks: readonly WindowTask[], now: number): number {
  return tasks.reduce((end, task) => Math.max(end, windowEnd(task, now)), now);
}

function windowEnd(task: WindowTask, now: number): number {
  if (task.type === "big") {
    return Math.min(task.deadline ? Date.parse(task.deadline) : Infinity, now + (task.spreadDays ?? 0) * WINDOW_DAY_MS);
  }
  return task.deadline ? Date.parse(task.deadline) : now + 14 * WINDOW_DAY_MS;
}
