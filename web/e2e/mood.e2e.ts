import { expect, test, type Page } from "@playwright/test";

// Supabase is not reachable from tests: the session is seeded in localStorage and the moods REST table is stubbed.
const SUPABASE = "https://uwclblkzpohkkzrpiibe.supabase.co";
const SESSION_KEY = "sb-uwclblkzpohkkzrpiibe-auth-token";

const session = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: {
    id: "00000000-0000-0000-0000-000000000001",
    aud: "authenticated",
    role: "authenticated",
    email: "owner@example.com",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00Z",
  },
};

interface Entry {
  emotion: string;
  note: string | null;
}
interface Fake {
  rows: Map<string, Entry>;
  failSaves: boolean;
}

async function setUp(page: Page, fake: Fake) {
  await page.route(`${SUPABASE}/**`, (route) => route.fulfill({ status: 404, contentType: "application/json", body: "{}" }));
  await page.route(`${SUPABASE}/rest/v1/moods**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === "GET") {
      const from = url.searchParams.getAll("day").find((b) => b.startsWith("gte."))!.slice(4);
      const to = url.searchParams.getAll("day").find((b) => b.startsWith("lte."))!.slice(4);
      const body = [...fake.rows].filter(([d]) => d >= from && d <= to).map(([day, e]) => ({ day, ...e }));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (req.method() === "POST") {
      if (fake.failSaves) {
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "simulated save failure", code: "XX000" }) });
      }
      const row = req.postDataJSON() as { day: string; emotion: string; note: string | null };
      fake.rows.set(row.day, { emotion: row.emotion, note: row.note });
      return route.fulfill({ status: 201, body: "" });
    }
    if (req.method() === "DELETE") {
      fake.rows.delete(url.searchParams.get("day")!.slice(3));
      return route.fulfill({ status: 204, body: "" });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });
  await page.addInitScript(
    ([key, value]) => localStorage.setItem(key, value),
    [SESSION_KEY, JSON.stringify(session)],
  );
}

// Two-finger pinch centered on (cx, cy). Pinch out spreads the fingers, pinch in brings them together.
async function pinch(page: Page, cx: number, cy: number, dir: "out" | "in") {
  const cdp = await page.context().newCDPSession(page);
  const gap = (d: number) => [
    { x: cx - d, y: cy, id: 0 },
    { x: cx + d, y: cy, id: 1 },
  ];
  const from = dir === "out" ? 10 : 90;
  const to = dir === "out" ? 90 : 10;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: gap(from) });
  for (let i = 1; i <= 8; i++) {
    const d = from + ((to - from) * i) / 8;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: gap(d) });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const now = new Date();
const pad = (n: number) => String(n).padStart(2, "0");
const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const todayTitle = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

test("choose an emotion and a note, fail a save, and reload a day's entry", async ({ page }) => {
  const fake: Fake = { rows: new Map(), failSaves: false };
  await setUp(page, fake);
  await page.goto("/");
  await page.getByRole("tab", { name: "Mood", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const today = page.locator(`.mood-grid button[data-key="${todayKey}"]`);
  await expect(today).toHaveClass(/today/);
  await today.click();
  // The picker is named by its day, so it is found by the same title it shows.
  const picker = page.getByRole("dialog", { name: todayTitle });
  await expect(picker.getByRole("heading")).toHaveText(todayTitle);
  await expect(picker.getByText("Saved: blank")).toBeVisible();

  await picker.getByRole("button", { name: "happy" }).click();
  await expect(today).toHaveCSS("background-color", "rgb(255, 213, 79)");
  expect(fake.rows.get(todayKey)).toEqual({ emotion: "happy", note: null });

  await picker.locator("textarea").fill("Talked with a lot of people");
  await picker.getByRole("button", { name: "Save note" }).click();
  await expect(picker.getByText("Saved: happy")).toBeVisible();
  expect(fake.rows.get(todayKey)).toEqual({ emotion: "happy", note: "Talked with a lot of people" });

  // A failed save shows the previous stored state and keeps the error until the next successful save.
  fake.failSaves = true;
  await picker.getByRole("button", { name: "annoyed" }).click();
  await expect(page.getByRole("alert")).toContainText("simulated save failure");
  await expect(today).toHaveCSS("background-color", "rgb(255, 213, 79)");
  await expect(picker.getByText("Saved: happy")).toBeVisible();

  fake.failSaves = false;
  await picker.getByRole("button", { name: "sad" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(today).toHaveCSS("background-color", "rgb(121, 134, 203)");

  // Stored entries survive a reload.
  await page.reload();
  await page.getByRole("tab", { name: "Mood", exact: true }).click();
  await expect(page.locator(`.mood-grid button[data-key="${todayKey}"]`)).toHaveCSS("background-color", "rgb(121, 134, 203)");

  await page.locator(`.mood-grid button[data-key="${todayKey}"]`).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear" }).click();
  await expect(page.locator(`.mood-grid button[data-key="${todayKey}"]`)).not.toHaveCSS("background-color", "rgb(121, 134, 203)");
  expect(fake.rows.has(todayKey)).toBe(false);
});

test("pinch out grows the day boxes and pinch in shrinks them", async ({ page }) => {
  const fake: Fake = { rows: new Map(), failSaves: false };
  await setUp(page, fake);
  await page.goto("/");
  await page.getByRole("tab", { name: "Mood", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

  const scroller = page.locator(".mood-scroll");
  const cell = page.locator(`.mood-grid button[data-key="${todayKey}"]`);
  const width = () => cell.evaluate((el) => el.getBoundingClientRect().width);
  const box = (await scroller.boundingBox())!;
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;

  const start = await width();
  await pinch(page, cx, cy, "out");
  await expect.poll(width).toBeGreaterThan(start);

  const grown = await width();
  await pinch(page, cx, cy, "in");
  await expect.poll(width).toBeLessThan(grown);
});

test("the grid renders only the rows near the viewport, not all 65 years", async ({ page }) => {
  const fake: Fake = { rows: new Map(), failSaves: false };
  await setUp(page, fake);
  await page.goto("/");
  await page.getByRole("tab", { name: "Mood", exact: true }).click();
  await expect(page.locator(`.mood-grid button[data-key="${todayKey}"]`)).toBeVisible();

  const rendered = await page.locator(".mood-grid button[data-key]").count();
  expect(rendered).toBeGreaterThan(0);
  expect(rendered).toBeLessThan(1000);
});
