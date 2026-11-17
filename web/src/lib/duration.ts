// Durations are typed in hours (decimals allowed, e.g. "0.5") and stored in whole minutes. No DOM, no network.

// Minutes for a typed number of hours, rounded to the nearest minute. Accepts "." or "," as the decimal mark.
// null when the text is not a number of hours above 0, or rounds to 0 minutes.
export function parseHours(raw: string): number | null {
  const text = raw.trim().replace(",", ".");
  if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return null;
  const minutes = Math.round(Number(text) * 60);
  return minutes > 0 ? minutes : null;
}

// Hours text for a number of minutes, with at most two decimals: 30 -> "0.5", 90 -> "1.5", 80 -> "1.33".
export function formatHours(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}
