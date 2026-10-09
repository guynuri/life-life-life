import { expect, test } from "@playwright/test";
import { SUPABASE_HOST, fixClock, serveGoogle, serveTable, signIn, taskRow, type Row } from "./helpers";

// FIXED_NOW is Monday 12 October 2026, 08:00 local, so "today" is 2026-10-12.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).toISOString();
const DAY = 24 * 60 * 60 * 1000;

function session(id: string, taskId: string, start: string, end: string): Row {
  return { id, task_id: taskId, start_at: start, end_at: end, calendar_event_id: null };
}

async function seedToday(page: import("@playwright/test").Page) {
  await signIn(page);
  await fixClock(page);
  const tasks = [
    taskRow({ id: "rent", title: "Pay rent", duration_min: 20 }),
    taskRow({ id: "essay", title: "Write essay", topic: "Uni", duration_min: 60 }),
    // Held: unscheduled, so placement does not place it. It must not appear on Today.
    taskRow({ id: "chore", title: "Unscheduled chore", held: true }),
  ];
  // Stored out of time order on purpose; tomorrow's session must not show.
  const sessions: Row[] = [
    session("essay-s", "essay", at(12, 14), at(12, 15)),
    session("rent-s", "rent", at(12, 9), at(12, 9, 20)),
    session("tomorrow-s", "rent", at(13, 9), at(13, 9, 20)),
  ];
  const people: Row[] = [
    { id: "ann", name: "Ann", tier: 1, interval_days: null, last_contacted_at: new Date(Date.now() - 8 * DAY).toISOString(), created_at: new Date(Date.now() - 60 * DAY).toISOString() },
    { id: "bob", name: "Bob", tier: 3, interval_days: null, last_contacted_at: new Date(Date.now() - DAY).toISOString(), created_at: new Date(Date.now() - 60 * DAY).toISOString() },
  ];
  await serveTable(page, "tasks", tasks);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "people", people);
  await serveTable(page, "moods", [{ day: "2026-10-12", color: "green" }]);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, []);
  return { tasks, sessions, people };
}

test("Today shows today's sessions in time order, due people, and the mood color; unscheduled tasks are not shown", async ({ page }) => {
  await seedToday(page);
  await page.goto("/");

  const today = page.locator("section.today");
  await expect(today.getByRole("heading", { name: "Today" })).toBeVisible();

  const sessionItems = today.locator(".today-session");
  await expect(sessionItems).toHaveCount(2);
  await expect(sessionItems.nth(0)).toContainText("Pay rent");
  await expect(sessionItems.nth(0)).toContainText("09:00–09:20");
  await expect(sessionItems.nth(1)).toContainText("Write essay");
  await expect(sessionItems.nth(1)).toContainText("14:00–15:00");
  await expect(sessionItems.nth(1)).toContainText("Uni");

  await expect(today).not.toContainText("Unscheduled chore");

  // Ann is due (tier 1, 8 days since contact); Bob is not.
  const dueItems = today.locator(".today-person");
  await expect(dueItems).toHaveCount(1);
  await expect(dueItems.first()).toContainText("Ann");

  await expect(today.locator(".today-mood")).toContainText("green");
});

test("a failed people read shows an error for that part and keeps the sessions", async ({ page }) => {
  await seedToday(page);
  // Registered after seedToday, so this failure answers the people reads.
  await page.route(`https://${SUPABASE_HOST}/rest/v1/people**`, (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "people unavailable", code: "XX000" }) }),
  );
  await page.goto("/");

  const today = page.locator("section.today");
  await expect(today.getByRole("alert")).toContainText("Could not load people: people unavailable");
  const sessionItems = today.locator(".today-session");
  await expect(sessionItems).toHaveCount(2);
  await expect(today.locator(".today-mood")).toContainText("green");
});
