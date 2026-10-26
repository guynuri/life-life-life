import { describe, expect, it } from "vitest";
import {
  EMOTION_NAMES,
  MAX_SIZE,
  MIN_SIZE,
  anchoredScrollTop,
  clampSize,
  dayKey,
  daysLeft,
  gridCells,
  gridEnd,
  gridStart,
  parseDayKey,
  rowHeight,
} from "./moodView";

describe("grid range", () => {
  it("starts two months back, keeping the day of the month", () => {
    expect(dayKey(gridStart(new Date(2026, 9, 27)))).toBe("2026-08-27");
  });

  it("clamps the day when the earlier month is shorter", () => {
    expect(dayKey(gridStart(new Date(2026, 2, 31)))).toBe("2026-01-31");
    expect(dayKey(gridStart(new Date(2026, 4, 31)))).toBe("2026-03-31");
  });

  it("ends 65 years ahead on the same day", () => {
    expect(dayKey(gridEnd(new Date(2026, 9, 27)))).toBe("2091-10-27");
  });

  it("counts days left from today to the end, leap days included", () => {
    // 65 * 365 days, plus the 16 leap days (Feb 29 2028 through Feb 29 2088).
    expect(daysLeft(new Date(2026, 9, 27), gridEnd(new Date(2026, 9, 27)))).toBe(23741);
    expect(daysLeft(new Date(2026, 9, 27), new Date(2026, 9, 27))).toBe(0);
  });
});

describe("gridCells", () => {
  it("lays days in Sunday-start rows of 7, blank outside the range", () => {
    // Thu Aug 27 2026 to Mon Sep 7 2026: the first row starts Sun Aug 23, the last row ends Sat Sep 12.
    const cells = gridCells(new Date(2026, 7, 27), new Date(2026, 8, 7));
    expect(cells.length % 7).toBe(0);
    expect(cells.slice(0, 4)).toEqual([null, null, null, null]);
    expect(cells[4]).toBe("2026-08-27");
    expect(cells.filter((c) => c !== null)).toHaveLength(12);
    expect(cells.indexOf("2026-09-07")).toBeGreaterThan(-1);
    expect(cells.at(-1)).toBeNull();
  });

  it("covers the whole 65-year range with no gaps", () => {
    const today = new Date(2026, 9, 27);
    const cells = gridCells(gridStart(today), gridEnd(today));
    const days = cells.filter((c): c is string => c !== null);
    expect(days[0]).toBe("2026-08-27");
    expect(days.at(-1)).toBe("2091-10-27");
    expect(days).toHaveLength(Math.round((Date.UTC(2091, 9, 27) - Date.UTC(2026, 7, 27)) / 86_400_000) + 1);
  });
});

describe("pinch anchoring", () => {
  it("keeps the row under the pointer in place after the box size changes", () => {
    const oldSize = 36;
    const newSize = 72;
    const scrollTop = 500;
    const pointerY = 100;
    const next = anchoredScrollTop(scrollTop, pointerY, oldSize, newSize);
    const rowBefore = (scrollTop + pointerY) / rowHeight(oldSize);
    const rowAfter = (next + pointerY) / rowHeight(newSize);
    expect(rowAfter).toBeCloseTo(rowBefore, 9);
  });

  it("clamps box sizes to the allowed range", () => {
    expect(clampSize(1)).toBe(MIN_SIZE);
    expect(clampSize(999)).toBe(MAX_SIZE);
    expect(clampSize(36.4)).toBe(36);
  });
});

describe("emotions and keys", () => {
  it("offers eight emotions", () => {
    expect(EMOTION_NAMES).toHaveLength(8);
    expect(EMOTION_NAMES).toContain("happy");
  });

  it("day keys round-trip through parseDayKey", () => {
    expect(dayKey(parseDayKey("2026-10-09"))).toBe("2026-10-09");
  });
});
