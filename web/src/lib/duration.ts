// Durations are typed as hours plus minutes (e.g. 2 h 45 min) and stored in whole minutes. No DOM, no network.

export interface DurationFields {
  hours: string;
  minutes: string;
}

export const emptyDuration: DurationFields = { hours: "", minutes: "" };

// Total minutes for the typed hours and minutes. A blank field counts as 0.
// null when either field is not a whole number of 0 or more, or the total is 0.
export function parseDuration(fields: DurationFields): number | null {
  const hours = wholeOrZero(fields.hours);
  const minutes = wholeOrZero(fields.minutes);
  if (hours === null || minutes === null) return null;
  const total = hours * 60 + minutes;
  return total > 0 ? total : null;
}

// The fields for a stored duration: 165 -> 2 h 45 min, 30 -> 0 h 30 min, 120 -> 2 h 0 min.
export function splitDuration(totalMinutes: number): DurationFields {
  return { hours: String(Math.floor(totalMinutes / 60)), minutes: String(totalMinutes % 60) };
}

function wholeOrZero(raw: string): number | null {
  const text = raw.trim();
  if (text === "") return 0;
  return /^\d+$/.test(text) ? Number(text) : null;
}
