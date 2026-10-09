import { expect, test, type Page } from "@playwright/test";
import { fixClock, pickTime, serveGoogle, serveTable, signIn, taskDefaults, taskRow, type Row } from "./helpers";

const item = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
const menu = (page: Page, title: string) => page.getByRole("button", { name: `Task actions: ${title}` });

async function openTasks(page: Page, tasks: Row[], sessions: Row[], googleEvents: Row[] = [], failWrites = false) {
  await signIn(page);
  await fixClock(page);
  await serveTable(page, "tasks", tasks, { defaults: taskDefaults, failWrites });
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveTable(page, "reminders", []);
  await serveGoogle(page, googleEvents);
  await page.goto("/");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
}

test("placed sessions show; a session can be moved; unschedule holds; Schedule releases the hold", async ({ page }) => {
  const sessions: Row[] = [];
  await openTasks(page, [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })], sessions);

  await expect(item(page, "Pay rent")).toContainText("Placed");
  await expect(page.getByRole("status")).toContainText('Placed "Pay rent": 1 session.');
  expect(sessions).toHaveLength(1);

  // Move the session to 10:00 with the time field.
  await item(page, "Pay rent").getByRole("button", { name: /Move session/ }).click();
  await pickTime(page, item(page, "Pay rent").getByLabel("Time"), "10:00");
  await item(page, "Pay rent").getByRole("button", { name: "Save time" }).click();
  await expect(item(page, "Pay rent").getByRole("button", { name: /Move session/ })).toHaveCount(1);
  expect(sessions[0]?.start_at).toBe(new Date(2026, 9, 12, 10, 0).toISOString());
  expect(sessions[0]?.end_at).toBe(new Date(2026, 9, 12, 10, 20).toISOString());

  // Unschedule (from the row menu) removes the session and holds the task out of automatic placement.
  await menu(page, "Pay rent").click();
  await page.getByRole("menuitem", { name: "Unschedule" }).click();
  await expect(item(page, "Pay rent")).toContainText("Unscheduled");
  await expect(item(page, "Pay rent").getByRole("button", { name: /Move session/ })).toHaveCount(0);
  expect(sessions).toHaveLength(0);

  // Schedule releases the hold, so the task is placed again.
  await menu(page, "Pay rent").click();
  await page.getByRole("menuitem", { name: "Schedule" }).click();
  await expect(item(page, "Pay rent")).toContainText("Placed");
  expect(sessions).toHaveLength(1);

  // Delete asks first, then removes the task. The database cascades its sessions (0005), which this stub does not model.
  await menu(page, "Pay rent").click();
  await page.getByRole("menuitem", { name: "Delete task" }).click();
  await expect(page.getByText('Delete "Pay rent"?')).toBeVisible();
  await item(page, "Pay rent").getByRole("button", { name: "Yes, delete" }).click();
  await expect(item(page, "Pay rent")).toHaveCount(0);
});

test("a big task is placed as several sessions; tasks stay in deadline order; add and edit save", async ({ page }) => {
  const tasks = [
    taskRow({ id: "pay", title: "Pay rent", duration_min: 20 }),
    taskRow({ id: "report", title: "Write report", type: "big", duration_min: 300, topic: "Work", deadline: "2026-10-20T17:00:00.000Z", spread_days: 5 }),
  ];
  const sessions: Row[] = [];
  await openTasks(page, tasks, sessions);

  await expect(page.getByRole("listitem").nth(0)).toContainText("Write report");
  await expect(page.getByRole("listitem").nth(1)).toContainText("Pay rent");
  expect(sessions.filter((s) => s.task_id === "report")).toHaveLength(5);

  // Add a big task over two days, from the plus button in the sheet.
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const addForm = page.getByRole("form", { name: "Add task form" });
  await addForm.getByLabel("Title").fill("Plan trip");
  await addForm.getByRole("button", { name: "Type" }).click();
  await page.getByRole("option", { name: "Big" }).click();
  await addForm.getByLabel("Duration (minutes)").fill("120");
  await addForm.getByLabel("Spread over (days)").fill("2");
  await addForm.getByRole("button", { name: "Add task" }).click();
  await expect(item(page, "Plan trip")).toContainText("Placed");
  await expect(page.getByRole("status").filter({ hasText: "Plan trip" })).toContainText("2 sessions");
  await expect(item(page, "Plan trip").getByRole("button", { name: /Move session/ })).toHaveCount(2);

  // Edit the title of an existing task; type and spread are not offered in the edit sheet.
  await menu(page, "Pay rent").click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const editForm = page.getByRole("form", { name: "Edit task form" });
  await expect(editForm.getByRole("button", { name: "Type" })).toHaveCount(0);
  await editForm.getByLabel("Title").fill("Pay rent now");
  await editForm.getByRole("button", { name: "Save" }).click();
  await expect(item(page, "Pay rent now")).toBeVisible();
});

test("a failed save is shown and the list keeps the stored state", async ({ page }) => {
  await openTasks(page, [taskRow({ title: "Existing" })], [], [], true);
  await expect(item(page, "Existing")).toBeVisible();

  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const addForm = page.getByRole("form", { name: "Add task form" });
  await addForm.getByLabel("Title").fill("Will not save");
  await addForm.getByLabel("Duration (minutes)").fill("10");
  await addForm.getByRole("button", { name: "Add task" }).click();

  await expect(page.getByRole("alert")).toContainText("Could not save task: new row violates row-level security policy");
  await expect(item(page, "Will not save")).toHaveCount(0);
  await expect(page.getByRole("listitem")).toHaveCount(1);
});

test("completing a task moves it at once; the done list is an accordion; marking it not done places it again", async ({ page }) => {
  const sessions: Row[] = [];
  const tasks = [taskRow({ id: "pay", title: "Pay rent", duration_min: 20 })];
  await openTasks(page, tasks, sessions);
  await expect(item(page, "Pay rent")).toContainText("Placed");

  // Optimistic: the row leaves the list as soon as it is pressed; the accordion header counts it.
  await page.getByRole("checkbox", { name: "Complete Pay rent" }).click();
  await expect(item(page, "Pay rent")).toHaveCount(0);
  await expect(page.getByText("Done (1)")).toBeVisible();
  await expect.poll(() => tasks[0]?.done).toBe(true);
  expect(sessions).toHaveLength(0);

  // The accordion is collapsed by default; opening it shows the done row in place.
  await page.getByText("Done (1)").click();
  await expect(item(page, "Pay rent")).toContainText("Done");

  await menu(page, "Pay rent").click();
  await page.getByRole("menuitem", { name: "Mark not done" }).click();
  await expect(item(page, "Pay rent")).toContainText("Placed");
  expect(tasks[0]?.done).toBe(false);
  expect(sessions).toHaveLength(1);
});

test("a failed complete puts the row back and shows the error in the list", async ({ page }) => {
  const tasks = [taskRow({ id: "old", title: "Existing", held: true })];
  await openTasks(page, tasks, [], [], true);
  await expect(item(page, "Existing")).toContainText("Unscheduled");

  await page.getByRole("checkbox", { name: "Complete Existing" }).click();
  await expect(page.getByRole("alert")).toContainText('Could not complete "Existing"');
  await expect(item(page, "Existing")).toContainText("Unscheduled");
  await expect(page.getByText("Done (")).toHaveCount(0);
});

test("Move up and Move down reorder the list; placement ignores the order", async ({ page }) => {
  const tasks = [
    taskRow({ id: "pay", title: "Pay rent", duration_min: 20, position: 0 }),
    taskRow({ id: "report", title: "Write report", duration_min: 30, position: 10 }),
  ];
  await openTasks(page, tasks, []);
  await expect(page.getByRole("listitem").nth(0)).toContainText("Pay rent");
  await expect(page.getByRole("listitem").nth(1)).toContainText("Write report");

  // The first row has no Move up; the last row has no Move down.
  await menu(page, "Pay rent").click();
  await expect(page.getByRole("menuitem", { name: "Move up" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Move down" }).click();
  await expect(page.getByRole("listitem").nth(0)).toContainText("Write report");
  expect(tasks.find((task) => task.id === "report")?.position).toBe(0);
  expect(tasks.find((task) => task.id === "pay")?.position).toBe(10);

  await menu(page, "Pay rent").click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(page.getByRole("listitem").nth(0)).toContainText("Pay rent");
});

test("the optional fields are under More details; priority shows on the row", async ({ page }) => {
  await openTasks(page, [], []);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const addForm = page.getByRole("form", { name: "Add task form" });
  await expect(addForm.getByLabel("Topic (optional)")).toBeHidden();

  await addForm.getByLabel("Title").fill("Call mum");
  await addForm.getByLabel("Duration (minutes)").fill("15");
  await addForm.getByText("More details").click();
  await expect(addForm.getByLabel("Topic (optional)")).toBeVisible();
  await addForm.getByRole("radio", { name: "High" }).click();
  await addForm.getByRole("button", { name: "Add task" }).click();
  // Priority shows as a coloured edge on the row, with a name for screen readers.
  await expect(item(page, "Call mum").getByRole("img", { name: "High priority" })).toHaveCount(1);
  await expect(item(page, "Plan trip").getByRole("img", { name: /priority/ })).toHaveCount(0);
});

test("Refresh places new tasks and reloads the stored list", async ({ page }) => {
  const tasks: Row[] = [];
  const sessions: Row[] = [];
  await openTasks(page, tasks, sessions);
  await expect(page.getByText("Pay rent")).toHaveCount(0);

  tasks.push(taskRow({ id: "pay", title: "Pay rent", duration_min: 20 }));
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(item(page, "Pay rent")).toContainText("Placed");
  expect(sessions).toHaveLength(1);
});

test("each tab has a URL; back and reload keep the open tab", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, []);

  await page.goto("/#/tasks");
  const tasksTab = page.getByRole("tab", { name: "Tasks", exact: true });
  await expect(tasksTab).toHaveAttribute("aria-selected", "true");

  await page.getByRole("tab", { name: "People", exact: true }).click();
  await expect(page).toHaveURL(/#\/people$/);
  await page.goBack();
  await expect(page).toHaveURL(/#\/tasks$/);
  await expect(tasksTab).toHaveAttribute("aria-selected", "true");

  await page.reload();
  await expect(tasksTab).toHaveAttribute("aria-selected", "true");
});

test("the deadline date is picked in a calendar popover; the time stays a native field", async ({ page }) => {
  await openTasks(page, [], []);
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const addForm = page.getByRole("form", { name: "Add task form" });
  await addForm.getByLabel("Title").fill("Taxes");
  await addForm.getByLabel("Duration (minutes)").fill("30");
  await addForm.getByText("More details").click();
  await addForm.getByRole("button", { name: "Deadline (optional)" }).click();
  await page.locator(".calendar-popover .cal-day-button", { hasText: /^20$/ }).first().click();
  await expect(addForm.getByRole("button", { name: "Deadline (optional)" })).toContainText("Oct 20");
  await expect(addForm.getByLabel("Time")).toHaveText("23:59");
  await addForm.getByRole("button", { name: "Add task" }).click();
  await expect(item(page, "Taxes")).toContainText("due");
});

test("drag the grip to reorder; the order is display only", async ({ page }) => {
  const tasks = [
    taskRow({ id: "pay", title: "Pay rent", duration_min: 20, position: 0 }),
    taskRow({ id: "report", title: "Write report", duration_min: 30, position: 10 }),
  ];
  await openTasks(page, tasks, []);
  await expect(page.getByRole("listitem").nth(0)).toContainText("Pay rent");

  const grip = page.getByRole("button", { name: "Drag Pay rent to reorder" });
  const from = await grip.boundingBox();
  const below = await page.getByRole("listitem").nth(1).boundingBox();
  if (!from || !below) throw new Error("rows not visible");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2, below.y + below.height - 4, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByRole("listitem").nth(0)).toContainText("Write report");
  expect(tasks.find((t) => t.id === "report")?.position).toBe(0);
  expect(tasks.find((t) => t.id === "pay")?.position).toBe(10);
});

test("Today updates without Refresh when a task is added on Tasks", async ({ page }) => {
  await openTasks(page, [], []);
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(page.getByText("No sessions today.")).toBeVisible();

  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const addForm = page.getByRole("form", { name: "Add task form" });
  await addForm.getByLabel("Title").fill("Plan trip");
  await addForm.getByLabel("Duration (minutes)").fill("20");
  await addForm.getByRole("button", { name: "Add task" }).click();
  await expect(item(page, "Plan trip")).toContainText("Placed");

  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(page.locator("section.today .today-session", { hasText: "Plan trip" })).toBeVisible();
});
