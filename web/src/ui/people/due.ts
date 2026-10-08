export type Person = {
  id: string;
  name: string;
  tier: 1 | 2 | 3;
  interval_days: number | null;
  last_contacted_at: string | null;
  created_at: string;
};

// Default reach-out interval per tier. A person's interval_days overrides it.
export const TIER_INTERVAL_DAYS: Record<Person["tier"], number> = { 1: 7, 2: 14, 3: 30 };

const DAY_MS = 24 * 60 * 60 * 1000;

// Never-contacted people count from when they were added.
export function dueAt(p: Person): number {
  const anchor = Date.parse(p.last_contacted_at ?? p.created_at);
  return anchor + (p.interval_days ?? TIER_INTERVAL_DAYS[p.tier]) * DAY_MS;
}

// Tier 1 first, then most overdue first.
export function duePeople(people: Person[], now: number): Person[] {
  return people
    .filter((p) => dueAt(p) <= now)
    .sort((a, b) => a.tier - b.tier || dueAt(a) - dueAt(b));
}
