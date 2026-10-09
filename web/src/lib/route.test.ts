import { describe, expect, it } from "vitest";
import { formatPage, PAGE_IDS, parsePage } from "./route";

describe("parsePage", () => {
  it("reads each tab from its hash", () => {
    expect(parsePage("#/tasks")).toBe("tasks");
    expect(parsePage("#/people")).toBe("people");
    expect(parsePage("#/mood")).toBe("mood");
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
