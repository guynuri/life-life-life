// Public values only. The publishable key is safe in the browser; RLS protects the data.
export const SUPABASE_URL = "https://uwclblkzpohkkzrpiibe.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w7Tj8lQ0R3qzXP63tRhGOA_tK6t_7YX";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
// Public VAPID key for Web Push (SPEC 5). Only the public half goes here; the private key is an Edge Function secret.
export const VAPID_PUBLIC_KEY = "REPLACE_VAPID_PUBLIC_KEY";
