import { describe, expect, it } from "vitest";
import { GOOGLE_CALENDAR_SCOPE } from "./config";

describe("Google calendar scopes", () => {
  it("asks for event access and the calendar list, which the category list needs", () => {
    const scopes = GOOGLE_CALENDAR_SCOPE.split(" ");
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.events");
    expect(scopes).toContain("https://www.googleapis.com/auth/calendar.calendarlist.readonly");
  });
});
