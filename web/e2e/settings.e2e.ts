import { expect, test } from "@playwright/test";
import { fixClock, serveGoogle, serveTable, signIn, type Row, pickTime } from "./helpers";

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
  await expect(form.getByLabel("Work ends")).toHaveText("19:00");
  await pickTime(page, form.getByLabel("Work ends"), "18:00");
  await form.getByRole("button", { name: "Save work hours" }).click();
  await expect(page.getByRole("status")).toContainText("Saved work hours.");
  expect(saved[0]).toMatchObject({ end_min: 18 * 60, lunch_start_min: 12 * 60, lunch_end_min: 13 * 60 + 30 });

  // Lunch must fall inside work hours: a bad value shows an error and saves nothing new.
  await pickTime(page, form.getByLabel("Lunch ends"), "19:30");
  await form.getByRole("button", { name: "Save work hours" }).click();
  await expect(page.getByRole("alert")).toContainText("Lunch must fall inside work hours.");
  expect(saved).toHaveLength(1);
});

test("choosing Dark in Settings changes the page background, and the choice survives a reload", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "work_settings", []);
  await serveGoogle(page, []);

  await page.goto("/#/settings");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 248, 245)");
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(23, 20, 26)");
  await expect(page.getByRole("status")).toContainText("Theme set to Dark.");

  await page.reload();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(23, 20, 26)");
  await expect(page.getByRole("button", { name: "Dark", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Light", exact: true }).click();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(250, 248, 245)");
});
