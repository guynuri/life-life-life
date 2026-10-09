import { expect, test, type Page } from "@playwright/test";

// Supabase is not reachable in tests: the signed-in session is seeded locally and REST calls are served from memory.
const SUPABASE_HOST = "uwclblkzpohkkzrpiibe.supabase.co";
const STORAGE_KEY = "sb-uwclblkzpohkkzrpiibe-auth-token";

type Row = Record<string, unknown>;

const taskDefaults: Row = {
  type: "short_fixed",
  topic: null,
  deadline: null,
  spread_days: null,
  condition_place: "any",
  held: false,
};

function taskRow(overrides: Row): Row {
  return { id: crypto.randomUUID(), title: "", duration_min: 30, created_at: new Date().toISOString(), ...taskDefaults, ...overrides };
}

// Fixed clock: Monday 12 October 2026, 08:00 local, so placements are deterministic.
const FIXED_NOW = new Date(2026, 9, 12, 8, 0);

async function signIn(page: Page) {
  const expiresAt = Math.floor(FIXED_NOW.getTime() / 1000) + 3600; // the session must not look expired under the fixed clock
  const session = {
    access_token: "test-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "test-refresh-token",
    user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {}, created_at: FIXED_NOW.toISOString() },
  };
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(session)],
  );
}

// Serves one table from memory. Inserts get the table's defaults. When failWrites is set, writes return an error.
async function serveTable(page: Page, table: string, rows: Row[], options: { defaults?: Row; failWrites?: boolean } = {}) {
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

async function fixClock(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
}

test("placed sessions show; a session can be moved; unschedule holds; Schedule releases the hold", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const tasks = [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })];
  const sessions: Row[] = [];
  await serveTable(page, "tasks", tasks);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);

  await page.goto("/");
  const item = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await expect(item).toContainText("Placed");
  await expect(page.getByRole("status")).toContainText('Placed "Pay rent": 1 session.');
  expect(sessions).toHaveLength(1);

  // Move the session to 10:00.
  await item.getByRole("button", { name: /Move session/ }).click();
  await item.getByLabel("New start").fill("2026-10-12T10:00");
  await item.getByRole("button", { name: "Save time" }).click();
  await expect(item.getByRole("button", { name: /Move session/ })).toHaveCount(1);
  expect(sessions[0]?.start_at).toBe(new Date(2026, 9, 12, 10, 0).toISOString());
  expect(sessions[0]?.end_at).toBe(new Date(2026, 9, 12, 10, 20).toISOString());

  // Unschedule removes the session and holds the task out of automatic placement.
  await item.getByRole("button", { name: "Unschedule" }).click();
  await expect(item).toContainText("Unscheduled");
  await expect(item.getByRole("button", { name: /Move session/ })).toHaveCount(0);
  expect(sessions).toHaveLength(0);

  // Schedule releases the hold, so the task is placed again.
  await item.getByRole("button", { name: "Schedule" }).click();
  await expect(item).toContainText("Placed");
  expect(sessions).toHaveLength(1);

  // Delete asks first, then removes the task. The database cascades its sessions (0005), which this stub does not model.
  await item.getByRole("button", { name: "Delete task" }).click();
  await item.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Pay rent" })).toHaveCount(0);
});

test("a big task is placed as several sessions; tasks stay in deadline order; edits save", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const tasks = [
    taskRow({ id: "pay", title: "Pay rent", duration_min: 20 }),
    taskRow({ id: "report", title: "Write report", type: "big", duration_min: 300, topic: "Work", deadline: "2026-10-20T17:00:00.000Z", spread_days: 5 }),
  ];
  const sessions: Row[] = [];
  await serveTable(page, "tasks", tasks, { defaults: taskDefaults });
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);

  await page.goto("/");
  await expect(page.getByRole("listitem").nth(0)).toContainText("Write report");
  await expect(page.getByRole("listitem").nth(1)).toContainText("Pay rent");
  expect(sessions.filter((s) => s.task_id === "report")).toHaveLength(5);

  // Add a big task over two days: two sessions of an hour each.
  const addForm = page.getByRole("form", { name: "Add task" });
  await addForm.getByLabel("Title").fill("Plan trip");
  await addForm.getByLabel("Type").selectOption("big");
  await addForm.getByLabel("Duration (minutes)").fill("120");
  await addForm.getByLabel("Spread over (days)").fill("2");
  await addForm.getByRole("button", { name: "Add task" }).click();
  const planItem = page.getByRole("listitem").filter({ hasText: "Plan trip" });
  await expect(planItem).toContainText("Big · spread 2 days · Placed");
  await expect(page.getByRole("status").filter({ hasText: "Plan trip" })).toContainText("2 sessions");
  await expect(planItem.getByRole("button", { name: /Move session/ })).toHaveCount(2);

  // Edit the title of an existing task.
  const payItem = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await payItem.getByRole("button", { name: "Edit" }).click();
  const editItem = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Save" }) });
  await editItem.getByLabel("Title").fill("Pay rent now");
  await editItem.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Pay rent now" })).toBeVisible();
});

test("a failed save is shown and the list keeps the stored state", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const tasks = [taskRow({ title: "Existing" })];
  await serveTable(page, "tasks", tasks, { defaults: taskDefaults, failWrites: true });
  await serveTable(page, "sessions", []);
  await serveTable(page, "work_settings", []);

  await page.goto("/");
  await expect(page.getByRole("listitem").filter({ hasText: "Existing" })).toBeVisible();

  const addForm = page.getByRole("form", { name: "Add task" });
  await addForm.getByLabel("Title").fill("Will not save");
  await addForm.getByLabel("Duration (minutes)").fill("10");
  await addForm.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByRole("alert")).toContainText("Could not save task: new row violates row-level security policy");
  await expect(page.getByRole("listitem").filter({ hasText: "Will not save" })).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(1);
});
