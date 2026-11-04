import { expect, test } from "@playwright/test";
import { fixClock, serveTable, signIn, SUPABASE_HOST } from "./helpers";

test("the mood grid shows a loader until the moods are read", async ({ page }) => {
  await signIn(page);
  await fixClock(page);
  for (const table of ["tasks", "sessions", "people", "work_settings", "reminders"]) await serveTable(page, table, []);

  // Hold the mood read open, so the loader is on screen, then let it finish.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await serveTable(page, "moods", []);
  await page.route(`https://${SUPABASE_HOST}/rest/v1/moods**`, async (route) => {
    await gate;
    await route.fulfill({ json: [] });
  });

  await page.goto("/#/mood");
  await expect(page.getByText("Loading moods…")).toBeVisible();
  release();
  await expect(page.getByText("Loading moods…")).toHaveCount(0);
});
