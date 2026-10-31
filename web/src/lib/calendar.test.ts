import { afterEach, describe, expect, it, vi } from "vitest";
import { listAllEvents } from "./calendar";

// Serves a calendar list with one writable and one read-only calendar, and records every events request.
function stubCalendars(): string[] {
  const requested: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.includes("/users/me/calendarList")) {
        return new Response(
          JSON.stringify({
            items: [
              { id: "mine", summary: "Me", accessRole: "owner" },
              { id: "shared", summary: "Shared", accessRole: "reader" },
            ],
          }),
          { status: 200 },
        );
      }
      requested.push(url);
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    }),
  );
  return requested;
}

describe("listAllEvents", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("never requests events from a read-only calendar", async () => {
    const requested = stubCalendars();
    await listAllEvents("t", 0, 1000);
    expect(requested.some((url) => url.includes("/calendars/mine/events"))).toBe(true);
    expect(requested.some((url) => url.includes("/calendars/shared/events"))).toBe(false);
  });
});
