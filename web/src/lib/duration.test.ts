import { describe, expect, it } from "vitest";
import { parseDuration, splitDuration } from "./duration";

describe("parseDuration", () => {
  it("adds hours and minutes", () => {
    expect(parseDuration({ hours: "2", minutes: "45" })).toBe(165);
    expect(parseDuration({ hours: " 1 ", minutes: " 0 " })).toBe(60);
    expect(parseDuration({ hours: "0", minutes: "90" })).toBe(90);
  });

  it("treats a blank field as 0", () => {
    expect(parseDuration({ hours: "", minutes: "30" })).toBe(30);
    expect(parseDuration({ hours: "3", minutes: "" })).toBe(180);
  });

  it("rejects a zero total and anything but whole numbers", () => {
    for (const fields of [
      { hours: "", minutes: "" },
      { hours: "0", minutes: "0" },
      { hours: "-1", minutes: "30" },
      { hours: "1.5", minutes: "" },
      { hours: "1", minutes: "abc" },
    ]) {
      expect(parseDuration(fields)).toBeNull();
    }
  });
});

describe("splitDuration", () => {
  it("splits minutes into hours and minutes", () => {
    expect(splitDuration(165)).toEqual({ hours: "2", minutes: "45" });
    expect(splitDuration(30)).toEqual({ hours: "0", minutes: "30" });
    expect(splitDuration(120)).toEqual({ hours: "2", minutes: "0" });
  });

  it("round-trips through parseDuration", () => {
    for (const minutes of [5, 30, 45, 60, 80, 165, 300]) {
      expect(parseDuration(splitDuration(minutes))).toBe(minutes);
    }
  });
});
