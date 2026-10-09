-- SPEC known constraints: keep the free Supabase project awake so reminders keep working (CLAUDE.md).
-- A pg_cron job writes one row to a tiny table every 3 days. Run this by hand once. It is not a migration.
-- Do not upgrade to Pro for this. Only the keepalive table is written; no app data is touched.

create table if not exists public.keepalive (
  id integer primary key default 1,
  pinged_at timestamptz not null default now()
);
-- RLS on with no policy: only the cron job (postgres role) writes here; the app never reads it.
alter table public.keepalive enable row level security;

select cron.unschedule('keepalive')
where exists (select 1 from cron.job where jobname = 'keepalive');

select cron.schedule(
  'keepalive',
  '0 6 */3 * *',
  $$ insert into public.keepalive (id, pinged_at) values (1, now())
     on conflict (id) do update set pinged_at = excluded.pinged_at; $$
);
