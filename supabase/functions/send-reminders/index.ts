// Sends due reminders as Web Push (SPEC 5). pg_cron calls this every minute (supabase/reminders_cron.sql).
// The rules are in web/src/lib/reminders.ts and the due rule in web/src/lib/people.ts. This file only reads, sends and records.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.3";
import webpush from "npm:web-push@3.6.7";
import { afterAttempt, personReminders, sessionReminders, type Reminder } from "../../../web/src/lib/reminders.ts";
import type { Person, Tier } from "../../../web/src/lib/people.ts";

const DEFAULT_CONTACT_REMINDER_MIN = 19 * 60;

interface SubscriptionRow {
  user_id: string;
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timezone: string | null;
}

interface PersonRow {
  id: string;
  name: string;
  tier: number;
  interval_days: number | null;
  last_contacted_at: string | null;
  created_at: string;
}

interface SessionRowIn {
  id: string;
  start_at: string;
  tasks: { title: string } | null;
}

interface ReminderRow {
  id: string;
  title: string;
  body: string;
  attempts: number;
}

const iso = (ms: number) => new Date(ms).toISOString();

Deno.serve(async (req) => {
  if (req.headers.get("x-reminder-secret") !== Deno.env.get("REMINDER_SECRET")) {
    return new Response("forbidden", { status: 403 });
  }
  try {
    const sent = await runOnce(Date.now());
    return Response.json({ sent });
  } catch (error) {
    console.error("send-reminders failed", error);
    return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
  }
});

async function runOnce(now: number): Promise<number> {
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT")!,
    Deno.env.get("VAPID_PUBLIC_KEY")!,
    Deno.env.get("VAPID_PRIVATE_KEY")!,
  );

  const { data: subs, error } = await admin
    .from("push_subscriptions")
    .select("user_id, endpoint, keys, timezone");
  if (error) throw error;

  const byOwner = new Map<string, SubscriptionRow[]>();
  for (const sub of (subs ?? []) as SubscriptionRow[]) {
    byOwner.set(sub.user_id, [...(byOwner.get(sub.user_id) ?? []), sub]);
  }

  let sent = 0;
  for (const [owner, ownerSubs] of byOwner) {
    sent += await runForOwner(admin, owner, ownerSubs, now);
  }
  return sent;
}

async function runForOwner(
  admin: SupabaseClient,
  owner: string,
  subs: SubscriptionRow[],
  now: number,
): Promise<number> {
  const zone = subs[0]?.timezone ?? "UTC";

  const [settings, people, sessions] = await Promise.all([
    admin.from("work_settings").select("contact_reminder_min").eq("owner_id", owner).maybeSingle(),
    admin.from("people").select("id, name, tier, interval_days, last_contacted_at, created_at").eq("user_id", owner),
    admin
      .from("sessions")
      .select("id, start_at, tasks(title)")
      .eq("owner_id", owner)
      .gt("start_at", iso(now))
      .lte("start_at", iso(now + 10 * 60_000)),
  ]);
  for (const result of [settings, people, sessions]) if (result.error) throw result.error;

  const candidates: Reminder[] = [
    ...sessionReminders(
      ((sessions.data ?? []) as SessionRowIn[]).map((s) => ({
        id: s.id,
        start: Date.parse(s.start_at),
        taskTitle: s.tasks?.title ?? "Task",
      })),
      now,
      zone,
    ),
    ...personReminders(
      ((people.data ?? []) as PersonRow[]).map(toPerson),
      now,
      zone,
      settings.data?.contact_reminder_min ?? DEFAULT_CONTACT_REMINDER_MIN,
    ),
  ];
  if (candidates.length > 0) {
    const rows = candidates.map((c) => ({
      owner_id: owner,
      dedupe_key: c.dedupeKey,
      title: c.title,
      body: c.body,
      fire_at: iso(c.fireAt),
    }));
    // ignoreDuplicates: a reminder already queued (or already sent) keeps its row and is not sent again.
    const { error } = await admin.from("reminders").upsert(rows, { onConflict: "owner_id,dedupe_key", ignoreDuplicates: true });
    if (error) throw error;
  }

  const { data: due, error: dueError } = await admin
    .from("reminders")
    .select("id, title, body, attempts")
    .eq("owner_id", owner)
    .is("sent_at", null)
    .is("failed_at", null)
    .lte("fire_at", iso(now));
  if (dueError) throw dueError;

  let sent = 0;
  for (const reminder of (due ?? []) as ReminderRow[]) {
    const payload = JSON.stringify({ title: reminder.title, body: reminder.body, url: "./" });
    let delivered = false;
    for (const sub of subs) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload, { TTL: 3600 });
        delivered = true;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        // 404 or 410: the device unsubscribed or the subscription expired. Remove it so it is not tried again.
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        } else {
          console.error("push failed", status, error);
        }
      }
    }
    // Sent once any device accepts it (SPEC 5). Until then each run is one attempt; the third failed attempt marks it failed.
    // A retry only happens while no device has accepted, so no device gets the same reminder twice.
    const outcome = afterAttempt(reminder.attempts, delivered);
    const at = iso(Date.now());
    const change =
      outcome.state === "sent"
        ? { sent_at: at }
        : { attempts: reminder.attempts + 1, ...(outcome.state === "failed" ? { failed_at: at } : {}) };
    const { error } = await admin.from("reminders").update(change).eq("id", reminder.id);
    if (error) throw error;
    if (outcome.state === "sent") sent++;
  }
  return sent;
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier as Tier,
    intervalDays: row.interval_days,
    lastContactedAt: row.last_contacted_at,
    createdAt: row.created_at,
  };
}
