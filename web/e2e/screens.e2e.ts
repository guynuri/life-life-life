import { expect, test, type Page } from "@playwright/test";
import { fixClock, serveGoogle, serveTable, signIn, taskRow, type Row } from "./helpers";

const SHOTS = "C:/Users/LIOZ/AppData/Local/Temp/ui-work-shots";

async function stubAll(page: Page) {
  await signIn(page);
  await fixClock(page);
  const tasks: Row[] = [
    taskRow({ id: "pay", title: "Pay rent", duration_min: 20, topic: "Home", created_at: new Date(2026, 9, 1).toISOString(), position: 0 }),
    taskRow({ id: "call", title: "Call mum", duration_min: 15, priority: "high", position: 10 }),
    taskRow({ id: "read", title: "Read book", duration_min: 30, priority: "low", position: 20 }),
  ];
  const sessions: Row[] = [
    { id: "s1", task_id: "pay", start_at: new Date(2026, 9, 12, 10, 0).toISOString(), end_at: new Date(2026, 9, 12, 10, 20).toISOString(), calendar_event_id: null },
    { id: "s2", task_id: "call", start_at: new Date(2026, 9, 12, 8, 0).toISOString(), end_at: new Date(2026, 9, 12, 8, 15).toISOString(), calendar_event_id: null },
    { id: "s3", task_id: "read", start_at: new Date(2026, 9, 12, 8, 15).toISOString(), end_at: new Date(2026, 9, 12, 8, 45).toISOString(), calendar_event_id: null },
  ];
  await serveTable(page, "tasks", tasks);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveTable(page, "moods", []);
  await serveTable(page, "people", [
    { id: "p1", user_id: "00000000-0000-4000-8000-000000000001", name: "Ann", tier: 1, interval_days: null, last_contacted_at: null, created_at: new Date(2026, 8, 1).toISOString() },
    { id: "p2", user_id: "00000000-0000-4000-8000-000000000001", name: "Bea", tier: 2, interval_days: null, last_contacted_at: new Date(2026, 9, 10).toISOString(), created_at: new Date(2026, 8, 1).toISOString() },
  ]);
  await serveGoogle(page, []);
}

for (const width of [390, 1280]) {
  test(`screens at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
    await stubAll(page);
    for (const id of ["today", "tasks", "people", "mood", "settings"]) {
      await page.goto(`/#/${id}`);
      await expect(page.getByRole("tab", { name: new RegExp(id, "i") })).toHaveAttribute("aria-selected", "true");
      await page.waitForTimeout(700); // let the one entrance animation finish before the shot
      await page.screenshot({ path: `${SHOTS}/${width}-${id}.png` });
    }
  });
}

test("dark mode, phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await stubAll(page);
  for (const id of ["today", "tasks", "people", "mood", "settings"]) {
    await page.goto(`/#/${id}`);
    await expect(page.getByRole("tab", { name: new RegExp(id, "i") })).toHaveAttribute("aria-selected", "true");
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SHOTS}/dark-390-${id}.png` });
  }
});

test("the Tasks page has its styles applied", async ({ page }) => {
  await stubAll(page);
  await page.goto("/#/tasks");
  const row = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS("border-bottom-style", "solid");
  const add = page.getByRole("button", { name: "Add task", exact: true });
  await expect(add).toHaveCSS("background-color", "rgb(189, 232, 208)"); // the Tasks page accent (green)
  await expect(page.getByRole("tablist", { name: "Pages" })).toHaveCSS("position", "fixed");
});

test("the add-task sheet with its dropdown and calendar, light and dark, phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAll(page);
  await page.goto("/#/tasks");
  await expect(page.getByRole("tab", { name: "Tasks", exact: true })).toHaveAttribute("aria-selected", "true");

  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.getByRole("button", { name: "Add task", exact: true }).click();
    const form = page.getByRole("form", { name: "Add task form" });
    await form.getByRole("button", { name: "Type" }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/sheet-type-390-${scheme}.png` });
    await page.keyboard.press("Escape");
    await form.getByText("More details").click();
    await form.getByRole("button", { name: "Deadline (optional)" }).click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/sheet-calendar-390-${scheme}.png` });
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Close", exact: true }).click();
  }
});

test("the time popover on Settings, light and dark, phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAll(page);
  await page.goto("/#/settings");
  await expect(page.getByRole("tab", { name: "Settings", exact: true })).toHaveAttribute("aria-selected", "true");
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    const form = page.getByRole("form", { name: "Work hours" });
    await form.getByLabel("Work ends").click();
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SHOTS}/time-390-${scheme}.png` });
    await page.keyboard.press("Escape");
  }
});

test("Today after a change, light and dark, phone width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await stubAll(page);
  await page.goto("/#/today");
  await expect(page.getByRole("tab", { name: "Today", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await page.getByRole("button", { name: "Add task", exact: true }).click();
  const form = page.getByRole("form", { name: "Add task form" });
  await form.getByLabel("Title").fill("Plan trip");
  await form.getByLabel("Duration (minutes)").fill("20");
  await form.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Plan trip" })).toContainText("Placed");
  await page.getByRole("tab", { name: "Today", exact: true }).click();
  await expect(page.locator("section.today .today-session", { hasText: "Plan trip" })).toBeVisible();
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/today-after-change-390-light.png` });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: `${SHOTS}/today-after-change-390-dark.png` });
});
