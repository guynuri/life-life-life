// Self-check for moodMath. Run with `npm run check` in web/ (compiles with tsc, runs with node).
import assert from "node:assert/strict";
import { averageColors, blocksFor, colorOf, dayKey, step, weekNumber } from "./moodMath";

assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");

// Oct 2026: 31 days; 1 Oct is a Thursday, so Sunday-start weeks are Sep 27, Oct 4, 11, 18, 25.
assert.equal(blocksFor("day", new Date(2026, 9, 9)).length, 31);
const weeks = blocksFor("week", new Date(2026, 9, 9));
assert.deepEqual(weeks.map((b) => b.label), ["40", "41", "42", "43", "44"]);
assert.equal(blocksFor("month", new Date(2026, 9, 9)).length, 12);
assert.equal(blocksFor("year", new Date(2026, 9, 9)).length, 10);
assert.equal(blocksFor("year", new Date(2026, 9, 9))[9].label, "2026");

// Week numbers: week of Jan 1 is 1; Dec 2026 ends with a 53rd partial week.
assert.equal(weekNumber(new Date(2025, 11, 28)), 1);
assert.equal(weekNumber(new Date(2026, 0, 4)), 2);
assert.equal(weekNumber(new Date(2026, 11, 20)), 52);
assert.equal(weekNumber(new Date(2026, 11, 27)), 53);

assert.equal(averageColors([]), null);
assert.equal(averageColors(["#000000", "#ffffff"]), "#808080");

// Days roll up into a week; a week straddling into October counts its September days.
const moods = new Map([
  ["2026-10-05", "#000000"],
  ["2026-10-06", "#ffffff"],
  ["2026-09-28", "#ffffff"],
]);
const oct = blocksFor("month", new Date(2026, 9, 9))[9];
const wk4 = weeks.find((b) => b.key === "2026-10-04")!;
const wk27 = weeks.find((b) => b.key === "2026-09-27")!;
assert.equal(colorOf(wk4, "week", moods), "#808080");
assert.equal(colorOf(wk27, "week", moods), "#ffffff");
// October averages its weeks: (#808080 from Oct 4, #ffffff from Sep 27) -> #c0c0c0.
assert.equal(colorOf(oct, "month", moods), "#c0c0c0");
assert.equal(colorOf(weeks.find((b) => b.key === "2026-10-18")!, "week", moods), null);

assert.equal(step("day", new Date(2026, 0, 15), 1).getMonth(), 1);
assert.equal(step("year", new Date(2026, 0, 1), -1).getFullYear(), 2016);

console.log("moodMath ok");
