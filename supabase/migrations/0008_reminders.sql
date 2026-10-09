-- Phase 6: reminders (SPEC 5). Requires 0001 (push_subscriptions), 0003 (tasks), 0006 (work_settings).
-- Each row in reminders is one notification. The unique key makes each reminder go out at most once.
-- The send-reminders Edge Function (service role) creates session and person rows; the app inserts placement rows.
-- The pg_cron job that calls the function is NOT here: see supabase/reminders_cron.sql.

-- Each registered device records its time zone, so the function can compute local times (SPEC: device local time).
alter table public.push_subscriptions add column if not exists timezone text;

-- Contact reminder time, minutes after local midnight. Default 19:00 (SPEC 5). Work hours rows keep their values.
alter table public.work_settings
  add column if not exists contact_reminder_min integer not null default 1140
  check (contact_reminder_min >= 0 and contact_reminder_min < 1440);

-- Unplaced after the last placement run (SPEC 5): a task is announced when this turns on.
alter table public.tasks add column if not exists unplaced boolean not null default false;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dedupe_key text not null,
  title text not null,
  body text not null,
  fire_at timestamptz not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (owner_id, dedupe_key)
);

alter table public.reminders enable row level security;
create policy "owner only" on public.reminders for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Table privileges are separate from RLS (CLAUDE.md). The app only inserts and reads its own reminders.
grant select, insert on public.reminders to authenticated;
