import { expect, test } from "@playwright/test";
import { fixClock, serveGoogle, serveTable, signIn, type Row } from "./helpers";

test("Settings saves work hours and shows the result", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const saved: Row[] = [];
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "work_settings", saved);
  await serveGoogle(page, []);

  await page.goto("/#/settings");
  const form = page.getByRole("form", { name: "Work hours" });
  await expect(form.getByLabel("Work ends")).toHaveValue("19:00");
  await form.getByLabel("Work ends").fill("18:00");
  await form.getByRole("button", { name: "Save work hours" }).click();
  await expect(page.getByRole("status")).toContainText("Saved work hours.");
  expect(saved[0]).toMatchObject({ end_min: 18 * 60, lunch_start_min: 12 * 60, lunch_end_min: 13 * 60 + 30 });

  // Lunch must fall inside work hours: a bad value shows an error and saves nothing new.
  await form.getByLabel("Lunch ends").fill("19:30");
  await form.getByRole("button", { name: "Save work hours" }).click();
  await expect(page.getByRole("alert")).toContainText("Lunch must fall inside work hours.");
  expect(saved).toHaveLength(1);
});
