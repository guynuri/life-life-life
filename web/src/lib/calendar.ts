// Thin Google Calendar v3 access (SPEC 1). Every call names its calendar; session events use "primary".
// Every failure throws so the screen can show it. Auth failures (401/403, or no token in the session) throw
// GoogleApiError with that status; the screen offers Reconnect.
import { rfc3339, writableCalendars, type CalendarInfo, type EventBody, type GoogleEvent, type Span } from "./calendarEvents";

const API = "https://www.googleapis.com/calendar/v3";
const CALENDAR_LIST_URL = `${API}/users/me/calendarList`;

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

function eventsUrl(calendarId: string): string {
  return `${API}/calendars/${encodeURIComponent(calendarId)}/events`;
}

function request(token: string | null, method: string, url: string, body?: unknown): Promise<Response> {
  if (!token) throw new GoogleApiError(401, "No Google access in this session.");
  return fetch(url, {
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

// The calendars in the user's list. Owner and writer roles can write events.
export async function listCalendars(token: string | null): Promise<CalendarInfo[]> {
  const page = await json<{ items?: { id: string; summary?: string; accessRole?: string }[] }>(
    await request(token, "GET", CALENDAR_LIST_URL),
  );
  return (page.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary ?? c.id,
    writable: c.accessRole === "owner" || c.accessRole === "writer",
  }));
}

// Busy times: every event in the window on one calendar, following pages.
export async function listEvents(token: string | null, calendarId: string, from: number, to: number): Promise<GoogleEvent[]> {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ timeMin: rfc3339(from), timeMax: rfc3339(to), singleEvents: "true", maxResults: "2500" });
    if (pageToken) params.set("pageToken", pageToken);
    const page = await json<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      await request(token, "GET", `${eventsUrl(calendarId)}?${params}`),
    );
    events.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return events;
}

// Events in the window across every calendar the user can see, each tagged with its calendar.
export async function listAllEvents(token: string | null, from: number, to: number): Promise<{ calendarId: string; event: GoogleEvent }[]> {
  const items: { calendarId: string; event: GoogleEvent }[] = [];
  for (const calendar of await listCalendars(token)) {
    for (const event of await listEvents(token, calendar.id, from, to)) items.push({ calendarId: calendar.id, event });
  }
  return items;
}

// Returns null when the event is gone.
export async function getEvent(token: string | null, calendarId: string, eventId: string): Promise<GoogleEvent | null> {
  const response = await request(token, "GET", `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`);
  if (isGone(response)) return null;
  return json<GoogleEvent>(response);
}

export async function createEvent(token: string | null, calendarId: string, body: EventBody): Promise<string> {
  return (await json<GoogleEvent>(await request(token, "POST", eventsUrl(calendarId), body))).id;
}

export async function moveEvent(token: string | null, calendarId: string, eventId: string, span: Span): Promise<void> {
  const body = { start: { dateTime: rfc3339(span.start) }, end: { dateTime: rfc3339(span.end) } };
  await json<GoogleEvent>(await request(token, "PATCH", `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`, body));
}

// Deleting an event that is already gone is not an error.
export async function deleteEvent(token: string | null, calendarId: string, eventId: string): Promise<void> {
  const response = await request(token, "DELETE", `${eventsUrl(calendarId)}/${encodeURIComponent(eventId)}`);
  if (isGone(response)) return;
  if (!response.ok) throw await failure(response);
}

// Only the writable calendars, for the category picker.
export async function listWritableCalendars(token: string | null): Promise<CalendarInfo[]> {
  return writableCalendars(await listCalendars(token));
}
