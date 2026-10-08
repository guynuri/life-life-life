// Work hours: Sunday to Thursday, 09:00 to 19:00 local time. Fri and Sat are days off.
// Anything outside work hours counts as home.

export type Place = "work" | "home";

export function isWorkTime(at: Date): boolean {
  const day = at.getDay(); // 0 = Sunday
  const hour = at.getHours();
  return day >= 0 && day <= 4 && hour >= 9 && hour < 19;
}

export function placeAt(at: Date): Place {
  return isWorkTime(at) ? "work" : "home";
}

export function isWorkDay(at: Date): boolean {
  return at.getDay() <= 4;
}
