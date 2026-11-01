import { describe, expect, it } from "vitest";
import { formatPage, PAGE_IDS, parsePage, swipePage } from "./route";

describe("swipePage", () => {
  it("moves to the neighbour on a long, mostly horizontal swipe", () => {
    expect(swipePage("tasks", -120, 10)).toBe("people");
    expect(swipePage("tasks", 120, -5)).toBe("events");
    expect(swipePage("events", 120, 0)).toBe("today");
  });

  it("ignores short or vertical swipes", () => {
    expect(swipePage("tasks", -40, 0)).toBeNull();
    expect(swipePage("tasks", -100, 80)).toBeNull();
  });

  it("stops at the first and last tab", () => {
    expect(swipePage("today", 120, 0)).toBeNull();
    expect(swipePage("settings", -120, 0)).toBeNull();
  });
});

describe("parsePage", () => {
  it("reads each tab from its hash", () => {
    expect(parsePage("#/tasks")).toBe("tasks");
    expect(parsePage("#/people")).toBe("people");
    expect(parsePage("#/mood")).toBe("mood");
    expect(parsePage("#/events")).toBe("events");
  });

  it("sends empty and unknown hashes to today", () => {
    expect(parsePage("")).toBe("today");
    expect(parsePage("#")).toBe("today");
    expect(parsePage("#/")).toBe("today");
    expect(parsePage("#/nope")).toBe("today");
    expect(parsePage("#/tasks/extra")).toBe("today");
  });
});

describe("formatPage", () => {
  it("writes #/page", () => {
    expect(formatPage("mood")).toBe("#/mood");
  });

  it("round-trips every page", () => {
    for (const id of PAGE_IDS) expect(parsePage(formatPage(id))).toBe(id);
  });
});
