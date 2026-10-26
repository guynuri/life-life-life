// Keeps Google Calendar access for as long as the Supabase sign-in lasts. Google access tokens expire after about an hour
// and Supabase does not refresh them, so the refresh token is kept on this device and the google-token Edge Function
// (which holds the client secret) trades it for a new access token.
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { stillValid } from "./googleTokenCache";

const REFRESH_KEY = "google-refresh-token";

let cached: { token: string; expiresAt: number } | null = null;

// Keeps the refresh token from a sign-in. Supabase may drop it when it refreshes its own session.
export function rememberGoogleSession(session: Session | null): void {
  const refresh = session?.provider_refresh_token;
  if (!refresh) return;
  try {
    if (localStorage.getItem(REFRESH_KEY) !== refresh) cached = null;
    localStorage.setItem(REFRESH_KEY, refresh);
  } catch {
    // Private window or blocked storage: this session still works, but Google access ends with the token.
  }
}

// Forgets Google access on this device. Called on sign-out.
export function forgetGoogleAccess(): void {
  cached = null;
  try {
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    // Nothing stored to remove.
  }
}

// A Google access token for Calendar calls, or null when none can be had. Null makes the screens offer Reconnect.
export async function googleAccessToken(session: Session | null): Promise<string | null> {
  const now = Date.now();
  if (stillValid(cached, now)) return cached!.token;
  rememberGoogleSession(session);

  let refresh: string | null = null;
  try {
    refresh = localStorage.getItem(REFRESH_KEY);
  } catch {
    refresh = null;
  }
  if (!refresh || !supabase) return session?.provider_token ?? null;

  const { data, error } = await supabase.functions.invoke<{ access_token?: string; expires_in?: number }>("google-token", {
    body: { refresh_token: refresh },
  });
  if (error || !data?.access_token) return session?.provider_token ?? null;
  cached = { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 };
  return cached.token;
}
