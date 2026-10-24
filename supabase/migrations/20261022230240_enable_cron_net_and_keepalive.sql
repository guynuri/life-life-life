-- SPEC known constraints: keep the free Supabase project awake so reminders keep working (CLAUDE.md).
-- A pg_cron job writes one row to a tiny table every 3 days. Applied by the migrate workflow. Do not upgrade to Pro for this.
-- Only the keepalive table is written; no app data is touched.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create table if not exists public.keepalive (
  id integer primary key default 1,
  pinged_at timestamptz not null default now()
);
alter table public.keepalive enable row level security;
-- Supabase grants new public tables to anon and authenticated by default; revoke that.
-- RLS with no policy already returns no rows; only the postgres role (pg_cron) writes here.
revoke all on public.keepalive from anon, authenticated;

select cron.unschedule('keepalive')
where exists (select 1 from cron.job where jobname = 'keepalive');

select cron.schedule(
  'keepalive',
  '0 6 */3 * *',
  $$ insert into public.keepalive (id, pinged_at) values (1, now())
     on conflict (id) do update set pinged_at = excluded.pinged_at; $$
);
