import { expect, test, type Page } from "@playwright/test";
import { serveTable } from "./helpers";

// The shared signIn helper pins expiry to the fixed test clock, which is in the past, so the app would sign out.
// Seed a session that expires an hour from the real clock instead, as mood.e2e.ts does.
const SESSION_KEY = "sb-uwclblkzpohkkzrpiibe-auth-token";
const session = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: "owner@example.com", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" },
};

// Touch swipes are dispatched as events: Playwright's touchscreen only taps.
test.use({ hasTouch: true });

async function swipe(page: Page, selector: string, dx: number) {
  await page.locator(selector).first().evaluate((el, dx) => {
    const start = new Touch({ identifier: 1, target: el, clientX: 200, clientY: 300 });
    const end = new Touch({ identifier: 1, target: el, clientX: 200 + dx, clientY: 300 });
    el.dispatchEvent(new TouchEvent("touchstart", { touches: [start], changedTouches: [start], bubbles: true }));
    el.dispatchEvent(new TouchEvent("touchend", { touches: [], changedTouches: [end], bubbles: true }));
  }, dx);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [SESSION_KEY, JSON.stringify(session)],
  );
  for (const table of ["tasks", "sessions", "people", "moods", "work_settings", "reminders"]) await serveTable(page, table, []);
});

test("a swipe on a plain area moves to the next tab", async ({ page }) => {
  await page.goto("/#/tasks");
  await expect(page.locator("#tasks-heading")).toBeVisible();
  await swipe(page, "#tasks-heading", -120);
  await expect(page).toHaveURL(/#\/people$/);
});

test("a swipe that starts on the mood grid does not change tab", async ({ page }) => {
  await page.goto("/#/mood");
  await expect(page.locator(".mood-grid")).toBeVisible();
  await swipe(page, ".mood-grid", -120);
  await expect(page).toHaveURL(/#\/mood$/);
});

test("a swipe inside an open sheet does not change tab", async ({ page }) => {
  await page.goto("/#/tasks");
  await page.getByRole("button", { name: "New" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await swipe(page, ".sheet", -120);
  await expect(page).toHaveURL(/#\/tasks$/);
});
