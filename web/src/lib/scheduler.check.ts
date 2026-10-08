// Self-check, not wired into the app. From web/:
//   npx esbuild src/lib/scheduler.check.ts --bundle --platform=node --format=esm --outfile=check.mjs && node check.mjs
import { isWorkTime } from "./conditions";
import { schedule, type SchedTask, type Slot } from "./scheduler";

// Oct 11 2026 is a Sunday; Oct 12 Monday; Oct 16 Friday; Oct 17 Saturday.
const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m);
const slot = (s: Date, e: Date): Slot => ({ start: s, end: e });
const now = at(10, 12);

function check(cond: boolean, msg: string) {
  if (!cond) throw new Error(`check failed: ${msg}`);
}

function task(id: string, extra: Partial<SchedTask> = {}): SchedTask {
  return { id, kind: "scheduled_small", durationMinutes: 60, deadline: null, ...extra };
}

export function runChecks() {
  // Work-hours rule: Sun-Thu 09:00-19:00 only.
  check(isWorkTime(at(11, 9)), "Sun 09:00 is work");
  check(isWorkTime(at(15, 18, 59)), "Thu 18:59 is work");
  check(!isWorkTime(at(11, 8, 59)), "Sun 08:59 is home");
  check(!isWorkTime(at(15, 19)), "Thu 19:00 is home");
  check(!isWorkTime(at(16, 10)), "Fri 10:00 is a day off");
  check(!isWorkTime(at(17, 10)), "Sat 10:00 is a day off");

  // Weekend rule: a work_day task never lands on Fri or Sat.
  const fri = schedule([task("w", { kind: "work_day" })], [slot(at(16, 6), at(16, 23))], now);
  check(fri.unplaced.includes("w") && fri.placements.length === 0, "work_day skips Friday");
  const mon = schedule([task("w", { kind: "work_day" })], [slot(at(12, 6), at(12, 23))], now);
  check(mon.placements.length === 1, "work_day placed on Monday");

  // Work-hours rule: a work task stays inside 09:00-19:00.
  const work = schedule([task("job", { place: "work" })], [slot(at(12, 7), at(12, 22))], now);
  check(work.placements[0].start.getHours() === 9, "work task starts at 09:00");
  check(work.placements[0].end.getHours() === 10, "work task ends at 10:00");

  // Home rule: a home task must avoid work hours. 08:00-09:00 is the only home time before work.
  const home90 = schedule([task("study", { place: "home", durationMinutes: 90 })], [slot(at(12, 8), at(12, 12))], now);
  check(home90.unplaced.includes("study"), "90-min home task does not fit before 09:00");
  const home60 = schedule([task("study", { place: "home" })], [slot(at(12, 8), at(12, 12))], now);
  check(home60.placements[0].start.getHours() === 8, "60-min home task at 08:00");

  // Deadline: placement must end on or before the deadline.
  const dl = schedule([task("d", { deadline: at(12, 9) })], [slot(at(12, 6), at(12, 23))], now);
  check(dl.placements[0].end.getTime() <= at(12, 9).getTime(), "placement ends before deadline");
  const late = schedule([task("d", { deadline: at(12, 5) })], [slot(at(12, 6), at(12, 23))], now);
  check(late.unplaced.includes("d"), "task past its deadline is unplaced");

  // Now: nothing is placed in the past.
  const past = schedule([task("p")], [slot(at(10, 6), at(10, 11))], now);
  check(past.unplaced.includes("p"), "no placement before now");

  // Big task: 150 min splits into 60+60+30 on three different days, none overlapping.
  const big = schedule(
    [task("book", { kind: "big", durationMinutes: 150 })],
    [slot(at(12, 6), at(12, 23)), slot(at(13, 6), at(13, 23)), slot(at(14, 6), at(14, 23))],
    now,
  );
  check(big.placements.length === 3, "big task makes 3 sessions");
  const days = new Set(big.placements.map((p) => p.start.getDate()));
  check(days.size === 3, "big task sessions are on distinct days");

  // Spread: with a deadline, two sessions land three days apart (Oct 10 and Oct 13), not on back-to-back days.
  const windowSlots = [10, 11, 12, 13, 14, 15].map((d) => slot(at(d, d === 10 ? 12 : 6), at(d, 23)));
  const spread = schedule([task("long", { kind: "big", durationMinutes: 120, deadline: at(16, 0) })], windowSlots, now);
  check(spread.placements.length === 2, "spread big task makes 2 sessions");
  const gap = spread.placements[1].start.getDate() - spread.placements[0].start.getDate();
  check(gap === 3, `big task sessions spread across the window (gap ${gap} days)`);

  // Horizon: spreadDays 2 with no deadline spreads sessions over Oct 10 and Oct 11, and nothing lands after Oct 12 12:00.
  const horizon = schedule(
    [task("h", { kind: "big", durationMinutes: 120, spreadDays: 2 })],
    [10, 11, 12, 13].map((d) => slot(at(d, d === 10 ? 12 : 6), at(d, 23))),
    now,
  );
  check(horizon.placements.length === 2, "horizon big task makes 2 sessions");
  check(horizon.placements[1].start.getDate() - horizon.placements[0].start.getDate() === 1, "horizon sessions one day apart");
  check(horizon.placements.every((p) => p.end.getTime() <= at(12, 12).getTime()), "horizon respects spreadDays");
  const beyond = schedule(
    [task("beyond", { kind: "big", durationMinutes: 60, spreadDays: 1 })],
    [slot(at(13, 6), at(13, 23))],
    now,
  );
  check(beyond.unplaced.includes("beyond"), "no placement past the horizon");

  // Two tasks share one slot without overlapping.
  const two = schedule(
    [task("a"), task("b")],
    [slot(at(12, 9), at(12, 11))],
    now,
  );
  check(two.placements.length === 2, "two tasks fit in two hours");
  const [p1, p2] = two.placements;
  check(p1.end.getTime() <= p2.start.getTime() || p2.end.getTime() <= p1.start.getTime(), "placements do not overlap");

  console.log("scheduler checks passed");
}

runChecks();
