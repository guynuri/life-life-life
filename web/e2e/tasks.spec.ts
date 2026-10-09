import { expect, test } from "@playwright/test";
import { fixClock, serveGoogle, serveTable, signIn, taskDefaults, taskRow, type Row } from "./helpers";

test("placed sessions show; a session can be moved; unschedule holds; Schedule releases the hold", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const tasks = [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })];
  const sessions: Row[] = [];
  const googleEvents: Row[] = [];
  await serveTable(page, "tasks", tasks);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, googleEvents);

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
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
  const googleEvents: Row[] = [];
  await serveTable(page, "tasks", tasks, { defaults: taskDefaults });
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, googleEvents);

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
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
  await serveGoogle(page, []);

  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Existing" })).toBeVisible();

  const addForm = page.getByRole("form", { name: "Add task" });
  await addForm.getByLabel("Title").fill("Will not save");
  await addForm.getByLabel("Duration (minutes)").fill("10");
  await addForm.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByRole("alert")).toContainText("Could not save task: new row violates row-level security policy");
  await expect(page.getByRole("listitem").filter({ hasText: "Will not save" })).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(1);
});
