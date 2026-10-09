// Pure person rules (SPEC 3). No DOM, no network: "now" is always an input.

export type Tier = 1 | 2 | 3;

export interface Person {
  id: string;
  name: string;
  tier: Tier;
  intervalDays: number | null;
  lastContactedAt: string | null;
  createdAt: string;
}

export interface PersonInput {
  name: string;
  tier: Tier;
  intervalDays: number | null;
}

const TIER_INTERVAL_DAYS: Record<Tier, number> = { 1: 7, 2: 14, 3: 30 };
const DAY_MS = 24 * 60 * 60 * 1000;

export function intervalDaysFor(person: Pick<Person, "tier" | "intervalDays">): number {
  return person.intervalDays ?? TIER_INTERVAL_DAYS[person.tier];
}

// Reference time is the last contact, or when the person was added if never contacted.
export function dueAtMs(person: Person): number {
  const reference = Date.parse(person.lastContactedAt ?? person.createdAt);
  return reference + intervalDaysFor(person) * DAY_MS;
}

export function isDue(person: Person, nowMs: number): boolean {
  return nowMs >= dueAtMs(person);
}

// Tier 1 first, then most overdue (earliest due time) first.
export function dueNow(people: Person[], nowMs: number): Person[] {
  return people
    .filter((p) => isDue(p, nowMs))
    .sort((a, b) => a.tier - b.tier || dueAtMs(a) - dueAtMs(b));
}

export function everyone(people: Person[]): Person[] {
  return [...people].sort((a, b) => a.name.localeCompare(b.name));
}

export type ValidationResult = { ok: true; value: PersonInput } | { ok: false; error: string };

// Form strings in, a clean PersonInput out. A blank interval means "use the tier default".
export function validatePersonInput(name: string, tier: number, intervalText: string): ValidationResult {
  const trimmed = name.trim();
  if (trimmed === "") return { ok: false, error: "Name is required." };
  if (tier !== 1 && tier !== 2 && tier !== 3) return { ok: false, error: "Tier must be 1, 2, or 3." };

  const interval = intervalText.trim();
  if (interval === "") return { ok: true, value: { name: trimmed, tier, intervalDays: null } };
  if (!/^\d+$/.test(interval) || Number(interval) < 1) {
    return { ok: false, error: "Interval must be a whole number of days, 1 or more." };
  }
  return { ok: true, value: { name: trimmed, tier, intervalDays: Number(interval) } };
}
