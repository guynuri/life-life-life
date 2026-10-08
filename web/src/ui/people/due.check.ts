// Not run on import. Compile with tsc, then call checks() from node.
import { duePeople, dueAt, type Person } from "./due";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-09T12:00:00Z");
const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();

function person(over: Partial<Person>): Person {
  return {
    id: over.id ?? "x",
    name: over.name ?? "x",
    tier: 1,
    interval_days: null,
    last_contacted_at: null,
    created_at: daysAgo(100),
    ...over,
  };
}

export function checks() {
  // Tier default: tier 1 = 7 days. Contacted 6 days ago → not due; 8 days ago → due.
  assert(duePeople([person({ last_contacted_at: daysAgo(6) })], NOW).length === 0, "6d not due");
  assert(duePeople([person({ last_contacted_at: daysAgo(8) })], NOW).length === 1, "8d due");

  // Override wins over tier default.
  assert(duePeople([person({ tier: 3, interval_days: 2, last_contacted_at: daysAgo(3) })], NOW).length === 1, "override");
  assert(duePeople([person({ tier: 1, interval_days: 30, last_contacted_at: daysAgo(10) })], NOW).length === 0, "override longer");

  // Never contacted: counts from created_at.
  assert(duePeople([person({ created_at: daysAgo(3) })], NOW).length === 0, "new person not due");
  assert(duePeople([person({ created_at: daysAgo(30) })], NOW).length === 1, "old never-contacted due");

  // Order: tier first, then most overdue.
  const sorted = duePeople(
    [
      person({ id: "t2", tier: 2, last_contacted_at: daysAgo(100) }),
      person({ id: "t1-less", tier: 1, last_contacted_at: daysAgo(9) }),
      person({ id: "t1-more", tier: 1, last_contacted_at: daysAgo(20) }),
    ],
    NOW,
  ).map((p) => p.id);
  assert(sorted.join() === "t1-more,t1-less,t2", `order was ${sorted.join()}`);

  assert(dueAt(person({ last_contacted_at: daysAgo(0) })) === NOW + 7 * DAY, "dueAt math");
  console.log("people due checks passed");
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`check failed: ${msg}`);
}
