// Pure work-hours helpers for the Settings form (SPEC 2.4). No DOM, no network.

// "HH:MM" from a time input to minutes after midnight. Anything else gives NaN.
export function timeToMinutes(value: string): number {
  if (!/^\d{2}:\d{2}$/.test(value)) return NaN;
  const [hours = NaN, minutes = NaN] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export interface WorkHoursInput {
  startMin: number;
  endMin: number;
  lunchStartMin: number;
  lunchEndMin: number;
}

export type WorkHoursResult = { ok: true; value: WorkHoursInput } | { ok: false; error: string };

// Every time must parse, and each range must end after it starts.
export function validateWorkHours(input: WorkHoursInput): WorkHoursResult {
  if (Object.values(input).some(Number.isNaN)) return { ok: false, error: "Enter every time." };
  if (input.endMin <= input.startMin) return { ok: false, error: "Work must end after it starts." };
  if (input.lunchEndMin <= input.lunchStartMin) return { ok: false, error: "Lunch must end after it starts." };
  return { ok: true, value: input };
}
