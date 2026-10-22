import { describe, expect, it } from "vitest";
import { minutesToTime, timeToMinutes, validateWorkHours } from "./workHours";

const base = { startMin: 540, endMin: 1140, lunchStartMin: 720, lunchEndMin: 810 };

describe("time conversion", () => {
  it("reads HH:MM and rejects anything else", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("9:30")).toBeNaN();
    expect(timeToMinutes("")).toBeNaN();
  });

  it("writes minutes back as HH:MM", () => {
    expect(minutesToTime(570)).toBe("09:30");
    expect(minutesToTime(timeToMinutes("13:05"))).toBe("13:05");
  });
});

describe("validateWorkHours", () => {
  it("accepts a valid day", () => {
    expect(validateWorkHours(base)).toEqual({ ok: true, value: base });
  });

  it("rejects a missing time", () => {
    expect(validateWorkHours({ ...base, lunchStartMin: NaN })).toEqual({ ok: false, error: "Enter every time." });
  });

  it("rejects work that does not end after it starts", () => {
    expect(validateWorkHours({ ...base, endMin: 540 })).toEqual({ ok: false, error: "Work must end after it starts." });
  });

  it("rejects lunch that does not end after it starts", () => {
    expect(validateWorkHours({ ...base, lunchEndMin: 720 })).toEqual({ ok: false, error: "Lunch must end after it starts." });
  });
});
