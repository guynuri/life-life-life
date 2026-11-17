import { describe, expect, it } from "vitest";
import { formatHours, parseHours } from "./duration";

describe("parseHours", () => {
  it("converts hours to whole minutes", () => {
    expect(parseHours("1")).toBe(60);
    expect(parseHours("0.5")).toBe(30);
    expect(parseHours(".25")).toBe(15);
    expect(parseHours("1.5")).toBe(90);
    expect(parseHours(" 2 ")).toBe(120);
    expect(parseHours("1.33")).toBe(80);
  });

  it("accepts a comma as the decimal mark", () => {
    expect(parseHours("0,5")).toBe(30);
  });

  it("rejects empty, zero, negative and non-numbers", () => {
    for (const raw of ["", "0", "0.0", "-1", "abc", "1h", "1.2.3", "0.001"]) {
      expect(parseHours(raw)).toBeNull();
    }
  });
});

describe("formatHours", () => {
  it("shows minutes as hours with at most two decimals", () => {
    expect(formatHours(60)).toBe("1");
    expect(formatHours(30)).toBe("0.5");
    expect(formatHours(45)).toBe("0.75");
    expect(formatHours(80)).toBe("1.33");
  });

  it("round-trips through parseHours", () => {
    for (const minutes of [5, 10, 20, 30, 45, 50, 80, 90, 100, 125]) {
      expect(parseHours(formatHours(minutes))).toBe(minutes);
    }
  });
});
