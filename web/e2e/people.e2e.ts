import { expect, test, type Page, type Route } from "@playwright/test";

// Fake Supabase: an in-memory people table behind the PostgREST routes the app calls.
interface Row {
  id: string;
  name: string;
  tier: number;
  interval_days: number | null;
  last_contacted_at: string | null;
  created_at: string;
}

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY).toISOString();

async function fakeSupabase(page: Page, rows: Row[], failNextPatch?: string) {
  let nextId = 100;
  let patchFailure = failNextPatch ?? null;

  // Seed a signed-in session so the app skips the sign-in screen.
  await page.addInitScript(() => {
    const expiresAt = Math.floor(Date.now() / 1000) + 3600;
    const session = {
      access_token: "test-access-token",
      token_type: "bearer",
      expires_in: 3600,
      expires_at: expiresAt,
      refresh_token: "test-refresh-token",
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
    localStorage.setItem("sb-uwclblkzpohkkzrpiibe-auth-token", JSON.stringify(session));
  });

  const cors = {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "*",
  };

  await page.route("**/rest/v1/people**", async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const idFilter = url.searchParams.get("id")?.replace("eq.", "") ?? null;

    if (request.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: cors });
    }
    if (request.method() === "GET") {
      return route.fulfill({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify(rows) });
    }
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Omit<Row, "id" | "created_at" | "last_contacted_at">;
      rows.push({
        id: `new-${nextId++}`,
        last_contacted_at: null,
        created_at: new Date().toISOString(),
        interval_days: null,
        ...body,
      });
      return route.fulfill({ status: 201, headers: cors, body: "" });
    }
    if (request.method() === "PATCH") {
      if (patchFailure) {
        const message = patchFailure;
        patchFailure = null;
        return route.fulfill({
          status: 500,
          headers: cors,
          contentType: "application/json",
          body: JSON.stringify({ message, code: "XX000" }),
        });
      }
      const row = rows.find((r) => r.id === idFilter);
      Object.assign(row ?? {}, request.postDataJSON());
      return route.fulfill({ status: 204, headers: cors, body: "" });
    }
    if (request.method() === "DELETE") {
      const index = rows.findIndex((r) => r.id === idFilter);
      if (index >= 0) rows.splice(index, 1);
      return route.fulfill({ status: 204, headers: cors, body: "" });
    }
    return route.fulfill({ status: 405, headers: cors, body: "" });
  });
}

const seed: Row[] = [
  { id: "ann", name: "Ann", tier: 1, interval_days: null, last_contacted_at: daysAgo(8), created_at: daysAgo(60) },
  { id: "bob", name: "Bob", tier: 3, interval_days: null, last_contacted_at: daysAgo(1), created_at: daysAgo(60) },
  { id: "cy", name: "Cy", tier: 2, interval_days: 2, last_contacted_at: null, created_at: daysAgo(3) },
];

test("due people sit at the top with a Due mark; contacted resets the timer; add person", async ({ page }) => {
  const rows = structuredClone(seed);
  await fakeSupabase(page, rows);
  await page.goto("/");
  await page.getByRole("tab", { name: "People", exact: true }).click();

  const items = page.getByRole("listitem");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  // One list: due people first (Ann, tier 1, then Cy), then everyone else (Bob, not due).
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("Ann");
  await expect(items.nth(0)).toContainText("Due");
  await expect(items.nth(1)).toContainText("Cy");
  await expect(items.nth(2)).toContainText("Bob");
  await expect(items.nth(2)).not.toContainText("Due");

  // The Contacted icon resets Ann's timer, so she is no longer due and moves down the list.
  await page.getByRole("button", { name: "Mark Ann contacted" }).click();
  await expect(items.nth(0)).toContainText("Cy");
  // Ann is contacted within her interval now: below the people not yet contacted, with a red heart.
  await expect(items.nth(1)).toContainText("Ann");
  await expect(items.nth(2)).toContainText("Bob");
  await expect(items.filter({ hasText: "Ann" })).not.toContainText("Due");
  await expect(page.getByRole("button", { name: "Mark Ann contacted" })).toHaveAttribute("aria-pressed", "true");

  // Add a person from the plus button; a bad interval is rejected before saving.
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  const form = page.getByRole("form", { name: "Person form" });
  await form.getByLabel("Name").fill("Dee");
  await form.getByLabel(/Interval override/).fill("0");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Interval must be a whole number")).toBeVisible();

  await form.getByLabel(/Interval override/).fill("");
  await form.getByRole("button", { name: "Save" }).click();
  await expect(items).toHaveCount(4);
  await expect(items.filter({ hasText: "Dee" })).toContainText("Tier 2 · every 14 days");
});

test("a failed contacted save shows the error and the stored state", async ({ page }) => {
  const rows = structuredClone(seed);
  await fakeSupabase(page, rows, "database unavailable");
  await page.goto("/");
  await page.getByRole("tab", { name: "People", exact: true }).click();

  const items = page.getByRole("listitem");
  await expect(items).toHaveCount(3);
  await page.getByRole("button", { name: "Mark Ann contacted" }).click();

  await expect(page.getByText("Save failed: database unavailable")).toBeVisible();
  // Ann was not saved as contacted, so she is still due and still first.
  await expect(items.first()).toContainText("Ann");
  await expect(items.first()).toContainText("Due");
});
