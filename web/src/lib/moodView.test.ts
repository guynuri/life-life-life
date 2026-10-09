import { describe, expect, it } from "vitest";
import {
  MOOD_COLORS,
  average,
  blocksFor,
  dayKey,
  monthColor,
  parseDayKey,
  rangeOf,
  step,
  weekNumber,
  zoomIn,
  zoomOut,
  type ColorOf,
  type View,
} from "./moodView";

const colorsOn = (map: Record<string, "coral" | "blue">): ColorOf => (day) => map[day] ?? null;

describe("weekNumber", () => {
  it("year starting on Thursday: week 1 is the week of Jan 1, and 2026 has 53 weeks", () => {
    expect(weekNumber(new Date(2025, 11, 28))).toBe(1); // Thursday Jan 1 2026
    expect(weekNumber(new Date(2026, 11, 27))).toBe(53); // Thursday Dec 31 2026
  });

  it("year starting on Friday: the week of Jan 1 belongs to the previous year", () => {
    // 2021 starts on Friday. Week of Dec 27 2020 has Thursday Dec 31 2020 (2020 has 53 weeks).
    expect(weekNumber(new Date(2020, 11, 27))).toBe(53);
    expect(weekNumber(new Date(2021, 0, 3))).toBe(1); // Thursday Jan 7 2021
  });

  it("year starting on Saturday: 2021 ends with week 52", () => {
    // 2022 starts on Saturday. Week of Dec 26 2021 has Thursday Dec 30 2021.
    expect(weekNumber(new Date(2021, 11, 26))).toBe(52);
    expect(weekNumber(new Date(2022, 0, 2))).toBe(1); // Thursday Jan 6 2022
  });

  it("year starting on Wednesday: the week of Dec 29 2024 is week 1 of 2025", () => {
    expect(weekNumber(new Date(2024, 11, 29))).toBe(1); // Thursday Jan 2 2025
  });

  it("a 53-week year without a leap day (2015) ends with week 53", () => {
    expect(weekNumber(new Date(2015, 11, 27))).toBe(53);
  });
});

describe("average", () => {
  it("averages channel by channel and has no value for no colors", () => {
    expect(average([MOOD_COLORS.coral, MOOD_COLORS.blue])).toEqual([
      (255 + 129) / 2,
      (138 + 212) / 2,
      (128 + 250) / 2,
    ]);
    expect(average([])).toBeNull();
  });
});

describe("blocks", () => {
  it("a week averages its colored days and blank days do not count", () => {
    // Sun Oct 4 2026 to Sat Oct 10 2026 is one week.
    const colorOf = colorsOn({ "2026-10-04": "coral", "2026-10-06": "blue" });
    const week = blocksFor({ zoom: "week", year: 2026, month: 9 }, colorOf).find((b) => b.key === "2026-10-04");
    expect(week?.color).toEqual(average([MOOD_COLORS.coral, MOOD_COLORS.blue]));
  });

  it("a week with no colored days has no color", () => {
    const week = blocksFor({ zoom: "week", year: 2026, month: 9 }, colorsOn({})).find((b) => b.key === "2026-10-04");
    expect(week?.color).toBeNull();
  });

  it("a week touching two months counts toward both months", () => {
    // Sun Sep 27 2026 to Sat Oct 3 2026 touches September and October.
    const colorOf = colorsOn({ "2026-09-28": "coral" });
    expect(monthColor(2026, 8, colorOf)).toEqual(MOOD_COLORS.coral);
    expect(monthColor(2026, 9, colorOf)).toEqual(MOOD_COLORS.coral);
  });

  it("day blocks cover only the viewed month", () => {
    const days = blocksFor({ zoom: "day", year: 2026, month: 9 }, colorsOn({}));
    expect(days).toHaveLength(31);
    expect(days[0]?.key).toBe("2026-10-01");
  });

  it("year view shows 10 years ending with the viewed year", () => {
    const years = blocksFor({ zoom: "year", year: 2026, month: 0 }, colorsOn({})).map((b) => b.key);
    expect(years[0]).toBe("2017");
    expect(years[9]).toBe("2026");
  });
});

describe("zoom and navigation", () => {
  const week: View = { zoom: "week", year: 2026, month: 9 };

  it("drilling into a week shows only the viewed month's days", () => {
    const day = zoomIn(week, "2026-09-27");
    expect(day).toEqual({ zoom: "day", year: 2026, month: 9 });
    const days = blocksFor(day!, colorsOn({}));
    expect(days[0]?.key).toBe("2026-10-01");
    expect(days.some((b) => b.key.startsWith("2026-09"))).toBe(false);
  });

  it("zooms in and out one level at a time", () => {
    const year: View = { zoom: "year", year: 2026, month: 9 };
    const month = zoomIn(year, "2025")!;
    expect(month).toEqual({ zoom: "month", year: 2025, month: 9 });
    expect(zoomIn(month, "8")).toEqual({ zoom: "day", year: 2025, month: 8 });
    expect(zoomOut({ zoom: "day", year: 2025, month: 8 })).toEqual({ zoom: "week", year: 2025, month: 8 });
    expect(zoomOut(year)).toBeNull();
    expect(zoomIn({ zoom: "day", year: 2025, month: 8 }, "2025-09-01")).toBeNull();
  });

  it("steps by month, year, or ten years by zoom level", () => {
    expect(step({ zoom: "day", year: 2026, month: 11 }, 1)).toEqual({ zoom: "day", year: 2027, month: 0 });
    expect(step({ zoom: "week", year: 2026, month: 0 }, -1)).toEqual({ zoom: "week", year: 2025, month: 11 });
    expect(step({ zoom: "month", year: 2026, month: 3 }, 1)).toEqual({ zoom: "month", year: 2027, month: 3 });
    expect(step({ zoom: "year", year: 2026, month: 3 }, -1)).toEqual({ zoom: "year", year: 2016, month: 3 });
  });

  it("the stored range covers the year view's first year and week padding", () => {
    const range = rangeOf({ zoom: "year", year: 2026, month: 0 });
    expect(range.from <= "2017-01-01").toBe(true);
    expect(range.to >= "2026-12-31").toBe(true);
  });

  it("day keys round-trip through parseDayKey", () => {
    expect(dayKey(parseDayKey("2026-10-09"))).toBe("2026-10-09");
  });
});
