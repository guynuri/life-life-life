// Thin Google Calendar v3 access for the primary calendar (SPEC 1). Every failure throws so the screen can show it.
// Auth failures (401/403, or no token in the session) throw GoogleApiError with that status; the screen offers Reconnect.
import { rfc3339, type EventBody, type GoogleEvent, type Span } from "./calendarEvents";

const EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

export class GoogleApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

export function isGoogleAuthError(error: unknown): boolean {
  return error instanceof GoogleApiError && (error.status === 401 || error.status === 403);
}

function request(token: string | null, method: string, path: string, body?: unknown): Promise<Response> {
  if (!token) throw new GoogleApiError(401, "No Google access in this session.");
  return fetch(`${EVENTS_URL}${path}`, {
    method,
    headers: body === undefined ? { Authorization: `Bearer ${token}` } : { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function failure(response: Response): Promise<GoogleApiError> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return new GoogleApiError(response.status, body?.error?.message ?? `Google Calendar returned ${response.status}.`);
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw await failure(response);
  return (await response.json()) as T;
}

// An event that Google no longer has (deleted) answers 404 or 410.
function isGone(response: Response): boolean {
  return response.status === 404 || response.status === 410;
}

// Busy times: every event in the window, following pages.
export async function listEvents(token: string | null, from: number, to: number): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ timeMin: rfc3339(from), timeMax: rfc3339(to), singleEvents: "true", maxResults: "2500" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await json<{ items?: GoogleEvent[]; nextPageToken?: string }>(await request(token, "GET", `?${params}`));
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

// Returns null when the event is gone.
export async function getEvent(token: string | null, eventId: string): Promise<GoogleEvent | null> {
  const response = await request(token, "GET", `/${encodeURIComponent(eventId)}`);
  if (isGone(response)) return null;
  return json<GoogleEvent>(response);
}

export async function createEvent(token: string | null, body: EventBody): Promise<string> {
  return (await json<GoogleEvent>(await request(token, "POST", "", body))).id;
}

export async function moveEvent(token: string | null, eventId: string, span: Span): Promise<void> {
  const body = { start: { dateTime: rfc3339(span.start) }, end: { dateTime: rfc3339(span.end) } };
  await json<GoogleEvent>(await request(token, "PATCH", `/${encodeURIComponent(eventId)}`, body));
}

// Deleting an event that is already gone is not an error.
export async function deleteEvent(token: string | null, eventId: string): Promise<void> {
  const response = await request(token, "DELETE", `/${encodeURIComponent(eventId)}`);
  if (isGone(response)) return;
  if (!response.ok) throw await failure(response);
}
