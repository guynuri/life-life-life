import { expect, test, type Page } from "@playwright/test";
import { fixClock, serveGoogle, serveTable, signIn, taskRow, type Row } from "./helpers";

const SHOTS = "C:/Users/LIOZ/AppData/Local/Temp/claude/C--Users-LIOZ-Code-projects-life-life-life/af83ed0f-035c-4a33-8307-07ea522e9638/scratchpad";

async function stubAll(page: Page) {
  await signIn(page);
  await fixClock(page);
  const tasks: Row[] = [taskRow({ id: "pay", title: "Pay rent", duration_min: 20, topic: "Home", created_at: new Date(2026, 9, 1).toISOString() })];
  const sessions: Row[] = [
    { id: "s1", task_id: "pay", start_at: new Date(2026, 9, 12, 10, 0).toISOString(), end_at: new Date(2026, 9, 12, 10, 20).toISOString(), calendar_event_id: null },
  ];
  await serveTable(page, "tasks", tasks);
  await serveTable(page, "sessions", sessions);
  await serveTable(page, "work_settings", []);
  await serveTable(page, "moods", []);
  await serveTable(page, "people", [
    { id: "p1", user_id: "00000000-0000-4000-8000-000000000001", name: "Ann", tier: 1, interval_days: null, last_contacted_at: null, created_at: new Date(2026, 8, 1).toISOString() },
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
  await page.goto("/#/today");
  await expect(page.getByRole("tab", { name: "Today", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/dark-390-today.png` });
});

test("the Tasks page has its styles applied", async ({ page }) => {
  await stubAll(page);
  await page.goto("/#/tasks");
  const row = page.getByRole("listitem").filter({ hasText: "Pay rent" });
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS("border-radius", "14px");
  await expect(row).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const add = page.getByRole("button", { name: "Add task", exact: true });
  await expect(add).toHaveCSS("background-color", "rgb(255, 122, 26)");
  await expect(page.getByRole("tablist", { name: "Pages" })).toHaveCSS("position", "fixed");
});
