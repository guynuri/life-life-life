// Public values only. The publishable key is safe in the browser; RLS protects the data.
export const SUPABASE_URL = "https://uwclblkzpohkkzrpiibe.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_w7Tj8lQ0R3qzXP63tRhGOA_tK6t_7YX";
// calendar.events writes events; calendar.calendarlist.readonly lists the user's calendars (categories, busy time).
// Without the second scope, Google answers the calendar list with "insufficient permissions".
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly";
// Public VAPID key for Web Push (SPEC 5). Only the public half goes here; the private key is an Edge Function secret.
export const VAPID_PUBLIC_KEY = "BDsfQsfN6sQr9DKgbaqTbjmroRyEnpSd1vaJoQFhaz50c5ggLSAiFWuDYlLuw4lOHAe2ub-VRO3O8xGuIPg44Jk";
