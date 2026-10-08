// Self-check for moodMath. Node 20 can't run TS, so compile with tsc to a temp dir and run node on the output.
import assert from "node:assert/strict";
import { blockColor, blocksFor, dayKey, step, summarize } from "./moodMath";

assert.equal(dayKey(new Date(2026, 0, 5)), "2026-01-05");

// Oct 2026: 31 days; 1 Oct is a Thursday, so Sunday-start weeks are Sep 27, Oct 4, 11, 18, 25.
assert.equal(blocksFor("day", new Date(2026, 9, 9)).length, 31);
const weeks = blocksFor("week", new Date(2026, 9, 9));
assert.deepEqual(weeks.map((b) => b.label), ["27", "4", "11", "18", "25"]);
assert.equal(blocksFor("month", new Date(2026, 9, 9)).length, 12);
assert.deepEqual(blocksFor("year", new Date(2026, 9, 9)).map((b) => b.label).slice(-1), ["2026"]);
assert.equal(blocksFor("year", new Date(2026, 9, 9)).length, 10);

assert.equal(summarize([]), null);
assert.equal(summarize(["a", "b", "b"]), "b");
assert.equal(summarize(["a", "b"]), "a");

const moods = new Map([
  ["2026-10-05", "#a"],
  ["2026-10-06", "#a"],
  ["2026-10-07", "#b"],
]);
const oct4Week = weeks.find((b) => b.label === "4")!;
assert.equal(blockColor(oct4Week, moods), "#a");
assert.equal(blockColor(weeks.find((b) => b.label === "18")!, moods), null);

assert.equal(step("day", new Date(2026, 0, 15), 1).getMonth(), 1);
assert.equal(step("year", new Date(2026, 0, 1), -1).getFullYear(), 2016);

console.log("moodMath ok");
