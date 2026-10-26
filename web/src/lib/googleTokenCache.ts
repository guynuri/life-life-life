// Pure rule for reusing a Google access token. Kept apart from googleAccess.ts so it runs without the Supabase client.
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

// A cached access token is used until five minutes before Google says it expires.
export function stillValid(cache: { expiresAt: number } | null, now: number): boolean {
  return cache !== null && now < cache.expiresAt - EXPIRY_MARGIN_MS;
}
