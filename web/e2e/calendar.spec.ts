import { expect, test } from "@playwright/test";
import { fixClock, serveGoogle, serveTable, signIn, taskRow, type Row } from "./helpers";

// Monday 12 October 2026. Local times, so the assertions match the app's ISO output on any device time zone.
const at = (hour: number, minute = 0) => new Date(2026, 9, 12, hour, minute);
const iso = (hour: number, minute = 0) => at(hour, minute).toISOString();
// Google event times are RFC 3339 without milliseconds.
const google = (hour: number, minute = 0) => iso(hour, minute).replace(".000Z", "Z");

test("placement creates one event per session, linked to the task; a move updates the event; unschedule deletes it", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const sessions: Row[] = [];
  const googleEvents: Row[] = [];
  await serveTable(page, "tasks", [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })]);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, googleEvents);

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await expect(item).toContainText("Placed");
  expect(googleEvents).toHaveLength(1);
  expect(googleEvents[0]?.summary).toBe("Pay rent");
  expect(googleEvents[0]?.extendedProperties).toEqual({ private: { taskId: "pay", sessionId: sessions[0]?.id } });
  expect(sessions[0]?.calendar_event_id).toBe(googleEvents[0]?.id);

  // Moving the session moves the Google event to the same time.
  await item.getByRole("button", { name: /Move session/ }).click();
  await item.getByLabel("New start").fill("2026-10-12T10:00");
  await item.getByRole("button", { name: "Save time" }).click();
  await expect(item.getByRole("button", { name: /Move session/ })).toHaveCount(1);
  expect(googleEvents[0]?.start).toEqual({ dateTime: google(10) });
  expect(googleEvents[0]?.end).toEqual({ dateTime: google(10, 20) });
  expect(sessions[0]?.start_at).toBe(iso(10));

  // Unschedule deletes the event and holds the task.
  await item.getByRole("button", { name: "Unschedule" }).click();
  await expect(item).toContainText("Unscheduled");
  expect(googleEvents).toHaveLength(0);
  expect(sessions).toHaveLength(0);
});

test("sync on refresh: a moved event moves the session (even outside work hours); a deleted event unschedules and holds the task", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const tasks = [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })];
  const sessions = [{ id: "s1", task_id: "pay", start_at: iso(9), end_at: iso(9, 20), calendar_event_id: "e1" }];
  const googleEvents: Row[] = [
    { id: "e1", summary: "Pay rent", start: { dateTime: iso(9) }, end: { dateTime: iso(9, 20) }, extendedProperties: { private: { taskId: "pay", sessionId: "s1" } } },
  ];
  await serveTable(page, "tasks", tasks);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, googleEvents);

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Pay rent" })).toContainText("Placed");

  // Edit the time in Google Calendar, then refresh: the session follows, and nothing new is placed.
  googleEvents[0] = { ...googleEvents[0], start: { dateTime: iso(21) }, end: { dateTime: iso(21, 20) } };
  await page.reload();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Pay rent" }).getByRole("button", { name: /Move session/ })).toContainText("09:00 PM");
  expect(sessions).toHaveLength(1);
  expect(sessions[0]?.start_at).toBe(iso(21));
  expect(googleEvents).toHaveLength(1);

  // Delete the event in Google Calendar, then refresh: the task is unscheduled and held, not placed again.
  googleEvents.splice(0, 1);
  await page.reload();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await expect(item).toContainText("Unscheduled");
  expect(sessions).toHaveLength(0);
  expect(tasks[0]?.held).toBe(true);
  expect(googleEvents).toHaveLength(0);

  // Schedule releases the hold; the task is placed again with a new event.
  await item.getByRole("button", { name: "Schedule" }).click();
  await expect(item).toContainText("Placed");
  expect(googleEvents).toHaveLength(1);
});

test("a Google error on move is shown and the session keeps its stored time", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const sessions = [{ id: "s1", task_id: "pay", start_at: iso(9), end_at: iso(9, 20), calendar_event_id: "e1" }];
  const googleEvents: Row[] = [{ id: "e1", start: { dateTime: iso(9) }, end: { dateTime: iso(9, 20) } }];
  await serveTable(page, "tasks", [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })]);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, googleEvents, { failWrites: true });

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  const item = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await item.getByRole("button", { name: /Move session/ }).click();
  await item.getByLabel("New start").fill("2026-10-12T10:00");
  await item.getByRole("button", { name: "Save time" }).click();

  await expect(page.getByRole("alert")).toContainText("Could not move session: Backend Error");
  expect(sessions[0]?.start_at).toBe(iso(9));
  expect(googleEvents[0]?.start).toEqual({ dateTime: iso(9) });
});

test("without Google access the screen offers Reconnect Google and places nothing", async ({ page }) => {
  await signIn(page, { withGoogle: false });
  await fixClock(page);
  const sessions: Row[] = [];
  await serveTable(page, "tasks", [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })]);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, []);

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reconnect Google" })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Could not place tasks");
  await expect(page.getByRole("listitem").filter({ hasText: "Pay rent" })).toBeVisible();
  expect(sessions).toHaveLength(0);
});

test("an expired Google token (401) shows Reconnect Google", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  await serveTable(page, "tasks", [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })]);
  await serveTable(page, "sessions", []);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, [], { unauthorized: true });

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("button", { name: "Reconnect Google" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Pay rent" })).toContainText("Unplaced");
});
