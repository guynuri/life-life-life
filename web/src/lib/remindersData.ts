// Thin Supabase access for reminders, device subscriptions and the contact reminder time (SPEC 5). Failures are thrown.
import { supabase } from "./supabase";
import type { Reminder } from "./reminders";

export const DEFAULT_CONTACT_REMINDER_MIN = 19 * 60; // [Decided] 19:00

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("No data returned.");
  return result.data;
}

// Queued for the Edge Function, which sends it to this owner's devices (SPEC 5).
export async function insertReminder(reminder: Reminder): Promise<void> {
  const row = {
    dedupe_key: reminder.dedupeKey,
    title: reminder.title,
    body: reminder.body,
    fire_at: new Date(reminder.fireAt).toISOString(),
  };
  check(await client().from("reminders").insert(row).select());
}

// Contact reminder time, in minutes after local midnight. With no saved row, the default applies.
export async function getContactReminderMin(): Promise<number> {
  const rows = check(await client().from("work_settings").select("contact_reminder_min")) as { contact_reminder_min: number }[];
  return rows[0]?.contact_reminder_min ?? DEFAULT_CONTACT_REMINDER_MIN;
}

export async function saveContactReminderMin(minutes: number): Promise<void> {
  check(await client().from("work_settings").upsert({ contact_reminder_min: minutes }, { onConflict: "owner_id" }).select());
}

// Whether this device (identified by its push endpoint) is registered.
export async function isDeviceRegistered(endpoint: string): Promise<boolean> {
  const rows = check(await client().from("push_subscriptions").select("id").eq("endpoint", endpoint)) as { id: string }[];
  return rows.length > 0;
}

export async function registerDevice(endpoint: string, keys: PushKeys, timezone: string): Promise<void> {
  const row = { endpoint, keys, timezone };
  check(await client().from("push_subscriptions").upsert(row, { onConflict: "endpoint" }).select());
}

export async function unregisterDevice(endpoint: string): Promise<void> {
  check(await client().from("push_subscriptions").delete().eq("endpoint", endpoint).select());
}

export interface PushKeys {
  p256dh: string;
  auth: string;
}
