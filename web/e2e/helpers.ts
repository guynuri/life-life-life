import type { Page } from "@playwright/test";

// Supabase and Google are not reachable in tests: the signed-in session is seeded locally and REST calls are served from memory.
export const SUPABASE_HOST = "uwclblkzpohkkzrpiibe.supabase.co";
const STORAGE_KEY = "sb-uwclblkzpohkkzrpiibe-auth-token";
export const GOOGLE_HOST = "www.googleapis.com";

export type Row = Record<string, unknown>;

const taskDefaults: Row = {
  type: "short_fixed",
  topic: null,
  deadline: null,
  spread_days: null,
  condition_place: "any",
  held: false,
  unplaced: false,
};

export function taskRow(overrides: Row): Row {
  return { id: crypto.randomUUID(), title: "", duration_min: 30, created_at: new Date().toISOString(), ...taskDefaults, ...overrides };
}

export { taskDefaults };

// Fixed clock: Monday 12 October 2026, 08:00 local, so placements are deterministic.
export const FIXED_NOW = new Date(2026, 9, 12, 8, 0);

// Seeds a signed-in session. withGoogle adds the Google provider token that Supabase keeps after Google sign-in.
export async function signIn(page: Page, options: { withGoogle?: boolean } = {}) {
  const withGoogle = options.withGoogle ?? true;
  const expiresAt = Math.floor(FIXED_NOW.getTime() / 1000) + 3600; // the session must not look expired under the fixed clock
  const session = {
    access_token: "test-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "test-refresh-token",
    ...(withGoogle ? { provider_token: "test-google-token" } : {}),
    user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {}, created_at: FIXED_NOW.toISOString() },
  };
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(session)],
  );
}

// Serves one table from memory. Inserts get the table's defaults. When failWrites is set, writes return an error.
export async function serveTable(page: Page, table: string, rows: Row[], options: { defaults?: Row; failWrites?: boolean } = {}) {
  await page.route(`https://${SUPABASE_HOST}/rest/v1/${table}**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.searchParams.get("id")?.replace("eq.", "");
    const taskId = url.searchParams.get("task_id")?.replace("eq.", "");

    if (request.method() === "GET") return route.fulfill({ json: rows });
    if (options.failWrites) {
      return route.fulfill({ status: 403, json: { message: "new row violates row-level security policy", code: "42501" } });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Row | Row[];
      const created = (Array.isArray(body) ? body : [body]).map((item) => ({
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
        ...options.defaults,
        ...item,
      }));
      rows.push(...created);
      return route.fulfill({ status: 201, json: created });
    }
    if (request.method() === "PATCH") {
      const target = rows.find((r) => r.id === id);
      if (target) Object.assign(target, request.postDataJSON());
      return route.fulfill({ json: target ? [target] : [] });
    }
    if (request.method() === "DELETE") {
      for (let i = rows.length - 1; i >= 0; i--) {
        if ((id && rows[i]?.id === id) || (taskId && rows[i]?.task_id === taskId)) rows.splice(i, 1);
      }
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
}

// Serves the primary calendar's events from memory (events.list, get, insert, patch, delete).
// `events` is the Google side: tests change it to simulate edits made in Google Calendar.
export async function serveGoogle(page: Page, events: Row[], options: { unauthorized?: boolean; failWrites?: boolean } = {}) {
  await page.route(`https://${GOOGLE_HOST}/**`, async (route) => {
    const request = route.request();
    const method = request.method();
    const eventId = new URL(request.url()).pathname.split("/events/")[1];
    const error = (status: number, message: string) => route.fulfill({ status, json: { error: { code: status, message } } });

    if (options.unauthorized) return error(401, "Request had invalid authentication credentials.");
    if (method === "GET" && !eventId) return route.fulfill({ json: { items: events } });
    if (method === "POST") {
      if (options.failWrites) return error(500, "Backend Error");
      const created = { id: `event${events.length + 1}${crypto.randomUUID().slice(0, 8)}`, ...(request.postDataJSON() as Row) };
      events.push(created);
      return route.fulfill({ json: created });
    }
    const event = events.find((e) => e.id === eventId);
    if (!event) return error(404, "Not Found");
    if (method === "GET") return route.fulfill({ json: event });
    if (method === "PATCH") {
      if (options.failWrites) return error(500, "Backend Error");
      Object.assign(event, request.postDataJSON());
      return route.fulfill({ json: event });
    }
    if (method === "DELETE") {
      if (options.failWrites) return error(500, "Backend Error");
      events.splice(events.indexOf(event), 1);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
}

export async function fixClock(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
}
