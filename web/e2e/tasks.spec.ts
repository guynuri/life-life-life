import { expect, test, type Page } from "@playwright/test";

// Supabase is not reachable in tests: the signed-in session is seeded locally and REST calls are served from memory.
const SUPABASE_HOST = "uwclblkzpohkkzrpiibe.supabase.co";
const STORAGE_KEY = "sb-uwclblkzpohkkzrpiibe-auth-token";

type Row = Record<string, unknown>;

function row(overrides: Row): Row {
  return {
    id: crypto.randomUUID(),
    title: "",
    type: "short_fixed",
    duration_min: 30,
    topic: null,
    deadline: null,
    spread_days: null,
    condition_place: "any",
    scheduled_start: null,
    scheduled_end: null,
    calendar_event_id: null,
    held: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

async function signIn(page: Page) {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: "test-access-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    refresh_token: "test-refresh-token",
    user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [STORAGE_KEY, JSON.stringify(session)],
  );
}

// Serves the tasks table from memory. When failWrites is set, inserts, updates and deletes return an error.
async function serveTasks(page: Page, rows: Row[], failWrites = false) {
  await page.route(`https://${SUPABASE_HOST}/rest/v1/tasks**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const id = url.searchParams.get("id")?.replace("eq.", "");

    if (request.method() === "GET") return route.fulfill({ json: rows });
    if (failWrites) {
      return route.fulfill({ status: 403, json: { message: "new row violates row-level security policy", code: "42501" } });
    }
    if (request.method() === "POST") {
      const created = row(request.postDataJSON() as Row);
      rows.push(created);
      return route.fulfill({ status: 201, json: [created] });
    }
    if (request.method() === "PATCH") {
      const target = rows.find((r) => r.id === id);
      if (target) Object.assign(target, request.postDataJSON());
      return route.fulfill({ json: target ? [target] : [] });
    }
    if (request.method() === "DELETE") {
      const index = rows.findIndex((r) => r.id === id);
      if (index >= 0) rows.splice(index, 1);
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fallback();
  });
}

test("signed-in owner can add, edit, unschedule and delete tasks", async ({ page }) => {
  await signIn(page);
  const rows: Row[] = [
    row({ id: "pay", title: "Pay rent", duration_min: 20 }),
    row({ id: "report", title: "Write report", type: "big", duration_min: 300, topic: "Work", deadline: "2026-10-20T17:00:00.000Z", spread_days: 5 }),
  ];
  await serveTasks(page, rows);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();

  // Earliest deadline first, then no deadline.
  await expect(page.getByRole("listitem").nth(0)).toContainText("Write report");
  await expect(page.getByRole("listitem").nth(1)).toContainText("Pay rent");

  // Add a big task: it shows its spread and is unplaced.
  const addForm = page.getByRole("form", { name: "Add task" });
  await addForm.getByLabel("Title").fill("Plan trip");
  await addForm.getByLabel("Type").selectOption("big");
  await addForm.getByLabel("Duration (minutes)").fill("120");
  await addForm.getByLabel("Spread over (days)").fill("2");
  await addForm.getByRole("button", { name: "Add task" }).click();
  const planItem = page.getByRole("listitem").filter({ hasText: "Plan trip" });
  await expect(planItem).toContainText("Big · spread 2 days · Unplaced");

  // Edit the title of an existing task.
  const payItem = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await payItem.getByRole("button", { name: "Edit" }).click();
  // The row being edited shows inputs, not its title text, so find it by its Save button.
  const editItem = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Save" }) });
  await editItem.getByLabel("Title").fill("Pay rent now");
  await editItem.getByRole("button", { name: "Save" }).click();
  const renamed = page.getByRole("listitem").filter({ hasText: "Pay rent now" });
  await expect(renamed).toBeVisible();

  // Unschedule holds the task out of automatic placement.
  await renamed.getByRole("button", { name: "Unschedule" }).click();
  await expect(renamed).toContainText("Unscheduled");

  // Delete asks first, then removes the task.
  await renamed.getByRole("button", { name: "Delete task" }).click();
  await renamed.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Pay rent now" })).toHaveCount(0);
});

test("a failed save is shown and the list keeps the stored state", async ({ page }) => {
  await signIn(page);
  const rows: Row[] = [row({ title: "Existing" })];
  await serveTasks(page, rows, true);

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
