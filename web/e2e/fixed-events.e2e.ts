import { expect, test } from "@playwright/test";
import { fixClock, GOOGLE_HOST, serveGoogle, serveTable, signIn, type Row } from "./helpers";

// Fixed events live in Google, so the calendar list and events are served from memory here.
async function serveCalendarList(page: import("@playwright/test").Page) {
  // Registered after serveGoogle, so this route answers the calendar list first.
  await page.route(`https://${GOOGLE_HOST}/calendar/v3/users/me/calendarList`, (route) =>
    route.fulfill({ json: { items: [{ id: "primary", summary: "Me", accessRole: "owner" }] } }),
  );
}

test("add, edit, and delete a fixed event from Today", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  const googleEvents: Row[] = [];
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "people", []);
  await serveTable(page, "moods", []);
  await serveGoogle(page, googleEvents);
  await serveCalendarList(page);

  await page.goto("/");

  // Add: the event goes to Google with the chosen start, duration and calendar, and shows on Today.
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Title").fill("Haircut");
  await page.getByLabel("Start").fill("2026-10-12T10:00");
  await page.getByLabel("Duration (minutes)").fill("45");
  await page.getByRole("button", { name: "Save" }).click();
  const row = page.getByRole("button", { name: /Haircut/ });
  await expect(row).toBeVisible();
  expect(googleEvents).toHaveLength(1);
  expect(googleEvents[0]?.summary).toBe("Haircut");
  expect(googleEvents[0]?.reminders).toEqual({ useDefault: true });
  expect(googleEvents[0]?.extendedProperties).toEqual({ private: { lifeKind: "fixed" } });

  // Edit: the title change is saved to the same Google event.
  await row.click();
  await page.getByLabel("Title").fill("Haircut at Sam's");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: /Haircut at Sam's/ })).toBeVisible();
  expect(googleEvents[0]?.summary).toBe("Haircut at Sam's");

  // Delete: asks first, then removes the Google event and the row.
  await page.getByRole("button", { name: /Haircut at Sam's/ }).click();
  await page.getByRole("button", { name: "Delete…" }).click();
  await page.getByRole("button", { name: "Delete event" }).click();
  await expect(page.getByRole("button", { name: /Haircut/ })).toHaveCount(0);
  await expect.poll(() => googleEvents.length).toBe(0);
});

test("refresh follows Google: an event deleted in Google Calendar leaves Today", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  // An event that already exists in Google, made outside the app (no fixed tag needed to show here: it is tagged as fixed).
  const googleEvents: Row[] = [
    {
      id: "fixed1",
      summary: "Dentist",
      start: { dateTime: "2026-10-12T11:00:00Z" },
      end: { dateTime: "2026-10-12T11:30:00Z" },
      extendedProperties: { private: { lifeKind: "fixed" } },
    },
  ];
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "people", []);
  await serveTable(page, "moods", []);
  await serveTable(page, "work_settings", []);
  await serveTable(page, "reminders", []);
  await serveGoogle(page, googleEvents);
  await serveCalendarList(page);

  await page.goto("/");
  await expect(page.getByRole("button", { name: /Dentist/ })).toBeVisible();

  // Deleted in Google Calendar, then Refresh.
  googleEvents.splice(0, googleEvents.length);
  await page.getByRole("button", { name: "Refresh" }).click();
  await expect(page.getByRole("button", { name: /Dentist/ })).toHaveCount(0);
});

test("a 403 from the calendar list offers Reconnect Google instead of a raw error", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "people", []);
  await serveTable(page, "moods", []);
  await serveGoogle(page, []);
  // An old grant without the calendar list scope.
  await page.route(`https://${GOOGLE_HOST}/calendar/v3/users/me/calendarList`, (route) =>
    route.fulfill({ status: 403, json: { error: { code: 403, message: "Insufficient Permission" } } }),
  );

  await page.goto("/");
  await page.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByRole("button", { name: "Reconnect Google" })).toBeVisible();
});

test("a failed save shows the error and keeps the sheet open", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  await serveTable(page, "tasks", []);
  await serveTable(page, "sessions", []);
  await serveTable(page, "people", []);
  await serveTable(page, "moods", []);
  await serveGoogle(page, [], { failWrites: true });
  await serveCalendarList(page);

  await page.goto("/");
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Title").fill("Dentist");
  await page.getByLabel("Start").fill("2026-10-12T11:00");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("alert")).toContainText("Backend Error");
  await expect(page.getByRole("dialog", { name: "Add event" })).toBeVisible();
});
