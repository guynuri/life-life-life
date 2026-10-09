import { expect, test, type Page } from "@playwright/test";
import { serveGoogle, serveTable, signIn, SUPABASE_HOST, type Row } from "./helpers";

// Stubbed: Supabase REST (page.route, via serveTable) and Google. Notification permission is stubbed to "granted"
// because headless Chromium cannot answer the prompt. The service worker is not installed in dev, so the push
// subscription itself is never created; these tests cover the settings screen, not delivery.
async function serveReminderScreen(page: Page, settings: Row[] = []) {
  await signIn(page);
  await serveGoogle(page, []);
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "people", []);
  await serveTable(page, "moods", []);
  await serveTable(page, "reminders", []);
  await serveTable(page, "push_subscriptions", []);
  await serveTable(page, "work_settings", settings);
}

const settingsSection = (page: Page) => page.locator("section", { has: page.getByRole("heading", { name: "Reminders" }) });

test("shows the stored contact reminder time and saves a new one", async ({ page }) => {
  const settings: Row[] = [{ owner_id: "00000000-0000-4000-8000-000000000001", start_min: 540, end_min: 1140, contact_reminder_min: 18 * 60 }];
  await serveReminderScreen(page, settings);
  await page.goto("/");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();

  const section = settingsSection(page);
  await expect(section.getByText("Saved contact reminder time: 18:00")).toBeVisible();
  await expect(section.getByText("Notifications on this device: off")).toBeVisible();

  await section.getByLabel("Contact reminder time").fill("18:30");
  await section.getByRole("button", { name: "Set time" }).click();
  await expect(section.getByText("Saved contact reminder time: 18:30")).toBeVisible();
  expect(settings.at(-1)?.contact_reminder_min).toBe(18 * 60 + 30);
});

test("a failed save shows the error and keeps the previously stored time", async ({ page }) => {
  const settings: Row[] = [{ owner_id: "00000000-0000-4000-8000-000000000001", start_min: 540, end_min: 1140, contact_reminder_min: 18 * 60 }];
  await serveReminderScreen(page, settings);
  await serveTable(page, "work_settings", settings, { failWrites: true });
  await page.goto("/");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();

  const section = settingsSection(page);
  await section.getByLabel("Contact reminder time").fill("20:00");
  await section.getByRole("button", { name: "Set time" }).click();
  await expect(section.getByRole("alert")).toContainText("Could not save the contact reminder time");
  await expect(section.getByText("Saved contact reminder time: 18:00")).toBeVisible();
});

test("a failed read is shown, not hidden", async ({ page }) => {
  await serveReminderScreen(page);
  await page.route(`https://${SUPABASE_HOST}/rest/v1/work_settings**`, (route) =>
    route.fulfill({ status: 500, json: { message: "database unavailable" } }),
  );
  await page.goto("/");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();

  await expect(settingsSection(page).getByRole("alert")).toContainText("Could not read the contact reminder time");
});

test("turning on in a build without a service worker explains why", async ({ page }) => {
  await page.addInitScript(() => {
    Notification.requestPermission = () => Promise.resolve("granted");
  });
  await serveReminderScreen(page);
  await page.goto("/");
  await page.getByRole("tab", { name: "Settings", exact: true }).click();

  const section = settingsSection(page);
  await section.getByRole("button", { name: "Turn on notifications" }).click();
  await expect(section.getByRole("alert")).toContainText("Could not turn on notifications");
  await expect(section.getByText("Notifications on this device: off")).toBeVisible();
});
