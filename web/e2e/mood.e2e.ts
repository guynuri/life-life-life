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

interface Fake {
  rows: Map<string, string>;
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
      const body = [...fake.rows].filter(([d]) => d >= from && d <= to).map(([day, color]) => ({ day, color }));
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    }
    if (req.method() === "POST") {
      if (fake.failSaves) {
        return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "simulated save failure", code: "XX000" }) });
      }
      const row = req.postDataJSON() as { day: string; color: string };
      fake.rows.set(row.day, row.color);
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
const firstOfMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

test("choose, save, fail, and reload a day's mood", async ({ page }) => {
  const fake: Fake = { rows: new Map(), failSaves: false };
  await setUp(page, fake);
  await page.goto("/");
  await page.getByRole("tab", { name: "Mood", exact: true }).click();
  await expect(page.getByText("Signed in as owner@example.com")).toBeVisible();

  const dayOne = page.locator(`.mood-grid button[data-key="${firstOfMonth}"]`);
  await dayOne.click();
  const picker = page.getByRole("dialog", { name: "Choose mood" });
  await expect(picker.getByRole("heading")).toHaveText(
    new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
  );
  await expect(picker.getByText("Saved: blank")).toBeVisible();

  await picker.getByRole("button", { name: "coral" }).click();
  await expect(dayOne).toHaveCSS("background-color", "rgb(255, 138, 128)");
  expect(fake.rows.get(firstOfMonth)).toBe("coral");

  // A failed save shows the previous stored state and keeps the error until the next successful save.
  fake.failSaves = true;
  await picker.getByRole("button", { name: "blue" }).click();
  await expect(page.locator(".mood").getByRole("alert")).toContainText("simulated save failure");
  await expect(dayOne).toHaveCSS("background-color", "rgb(255, 138, 128)");
  await expect(picker.getByText("Saved: coral")).toBeVisible();

  fake.failSaves = false;
  await picker.getByRole("button", { name: "green" }).click();
  await expect(page.locator(".mood").getByRole("alert")).toHaveCount(0);
  await expect(dayOne).toHaveCSS("background-color", "rgb(174, 213, 129)");

  // Stored colors survive a reload.
  await page.reload();
  await page.getByRole("tab", { name: "Mood", exact: true }).click();
  await expect(page.locator(`.mood-grid button[data-key="${firstOfMonth}"]`)).toHaveCSS("background-color", "rgb(174, 213, 129)");

  await page.locator(`.mood-grid button[data-key="${firstOfMonth}"]`).click();
  await page.getByRole("dialog").getByRole("button", { name: "Clear" }).click();
  await expect(page.locator(`.mood-grid button[data-key="${firstOfMonth}"]`)).not.toHaveCSS("background-color", "rgb(174, 213, 129)");
  expect(fake.rows.has(firstOfMonth)).toBe(false);
});

test("pinch in zooms out to weeks, pinch out on a week drills into that month's days", async ({ page }) => {
  const fake: Fake = { rows: new Map(), failSaves: false };
  await setUp(page, fake);
  await page.goto("/");
  await page.getByRole("tab", { name: "Mood", exact: true }).click();
  await expect(page.getByText("Signed in as owner@example.com")).toBeVisible();

  const grid = page.locator(".mood-grid");
  await expect(grid).toHaveClass(/zoom-day/);
  const box = (await grid.boundingBox())!;
  await pinch(page, box.x + box.width / 2, box.y + box.height / 2, "in");
  await expect(grid).toHaveClass(/zoom-week/);

  // Pin the pinch on the first week block, then pinch out to zoom in.
  const week = page.locator(".mood-grid button").first();
  const wb = (await week.boundingBox())!;
  await pinch(page, wb.x + wb.width / 2, wb.y + wb.height / 2, "out");
  await expect(grid).toHaveClass(/zoom-day/);

  // Only the viewed month's days are shown, not the days of the previous month in that week.
  const keys = await page.locator(".mood-grid button[data-key]").evaluateAll((els) =>
    els.map((el) => (el as HTMLElement).dataset.key ?? ""),
  );
  expect(keys).toHaveLength(daysInMonth);
  expect(keys.every((k) => k.startsWith(firstOfMonth.slice(0, 8)))).toBe(true);
});
