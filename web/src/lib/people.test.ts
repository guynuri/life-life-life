import { describe, expect, it } from "vitest";
import { dueNow, intervalDaysFor, isDue, orderPeople, type Person, validatePersonInput } from "./people";

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-10-09T12:00:00Z");

function person(overrides: Partial<Person>): Person {
  return {
    id: "x",
    name: "X",
    tier: 2,
    intervalDays: null,
    lastContactedAt: null,
    createdAt: new Date(NOW - 100 * DAY).toISOString(),
    ...overrides,
  };
}

describe("intervalDaysFor", () => {
  it("uses the tier default when there is no override", () => {
    expect(intervalDaysFor({ tier: 1, intervalDays: null })).toBe(7);
    expect(intervalDaysFor({ tier: 2, intervalDays: null })).toBe(14);
    expect(intervalDaysFor({ tier: 3, intervalDays: null })).toBe(30);
  });

  it("prefers the override over the tier default", () => {
    expect(intervalDaysFor({ tier: 3, intervalDays: 2 })).toBe(2);
  });
});

describe("isDue", () => {
  it("is due exactly when the interval has passed since last contact", () => {
    const contacted = new Date(NOW - 14 * DAY).toISOString();
    const p = person({ lastContactedAt: contacted });
    expect(isDue(p, NOW)).toBe(true);
    expect(isDue(p, NOW - 1)).toBe(false);
  });

  it("counts a never-contacted person from when they were added", () => {
    const added = new Date(NOW - 8 * DAY).toISOString();
    expect(isDue(person({ tier: 1, createdAt: added }), NOW)).toBe(true);
    expect(isDue(person({ tier: 2, createdAt: added }), NOW)).toBe(false);
  });

  it("uses the override when set", () => {
    const contacted = new Date(NOW - 3 * DAY).toISOString();
    expect(isDue(person({ tier: 3, intervalDays: 3, lastContactedAt: contacted }), NOW)).toBe(true);
    expect(isDue(person({ tier: 3, intervalDays: 4, lastContactedAt: contacted }), NOW)).toBe(false);
  });
});

describe("dueNow", () => {
  it("lists tier 1 first, then most overdue first, and skips people not due", () => {
    const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
    const people = [
      person({ id: "t2-mild", name: "A", tier: 2, lastContactedAt: ago(15) }),
      person({ id: "t1-mild", name: "B", tier: 1, lastContactedAt: ago(8) }),
      person({ id: "t2-bad", name: "C", tier: 2, lastContactedAt: ago(40) }),
      person({ id: "t1-bad", name: "D", tier: 1, lastContactedAt: ago(30) }),
      person({ id: "not-due", name: "E", tier: 1, lastContactedAt: ago(1) }),
    ];
    expect(dueNow(people, NOW).map((p) => p.id)).toEqual(["t1-bad", "t1-mild", "t2-bad", "t2-mild"]);
  });
});

describe("validatePersonInput", () => {
  it("requires a name", () => {
    expect(validatePersonInput("  ", 2, "").ok).toBe(false);
  });

  it("treats a blank interval as no override and trims the name", () => {
    expect(validatePersonInput(" Ann ", 1, " ")).toEqual({
      ok: true,
      value: { name: "Ann", tier: 1, intervalDays: null },
    });
  });

  it("accepts whole numbers of 1 or more as the override", () => {
    expect(validatePersonInput("Ann", 2, "5")).toMatchObject({ ok: true, value: { intervalDays: 5 } });
  });

  it("rejects zero, negatives, decimals, and non-numbers", () => {
    for (const bad of ["0", "-3", "2.5", "abc"]) {
      expect(validatePersonInput("Ann", 2, bad).ok).toBe(false);
    }
  });

  it("rejects tiers outside 1 to 3", () => {
    expect(validatePersonInput("Ann", 4, "").ok).toBe(false);
  });
});

describe("orderPeople", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.parse("2026-10-12T12:00:00Z");
  const who = (name: string, tier: 1 | 2 | 3, daysSinceContact: number | null, addedDaysAgo = 100): Person => ({
    id: name,
    name,
    tier,
    intervalDays: null,
    lastContactedAt: daysSinceContact === null ? null : new Date(now - daysSinceContact * day).toISOString(),
    createdAt: new Date(now - addedDaysAgo * day).toISOString(),
  });

  it("puts due people first, oldest contact first, then the rest, oldest contact first", () => {
    const people = [
      who("Bea", 2, 1), // not due: contacted a day ago, interval 14
      who("Ann", 1, 8), // due: 8 days since contact, interval 7
      who("Cy", 2, 20), // due: 20 days since contact
      who("Dee", 3, 5), // not due
      who("Eve", 2, null, 3), // never contacted, added 3 days ago, interval 14: not due
    ];
    // Dee was contacted 5 days ago and Eve was added 3 days ago, so Dee (the older reference) comes first.
    expect(orderPeople(people, now).map((x) => x.person.name)).toEqual(["Cy", "Ann", "Dee", "Eve", "Bea"]);
    expect(orderPeople(people, now).map((x) => x.due)).toEqual([true, true, false, false, false]);
  });

  it("counts a person never contacted from the day they were added", () => {
    const people = [who("New", 2, null, 2), who("Old", 2, null, 40)];
    // Old is due (added 40 days ago, interval 14); New is not (added 2 days ago).
    expect(orderPeople(people, now).map((x) => x.person.name)).toEqual(["Old", "New"]);
  });
});
