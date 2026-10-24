create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net;

create table if not exists public.keepalive (
  id integer primary key default 1,
  pinged_at timestamptz not null default now()
);
alter table public.keepalive enable row level security;

select cron.unschedule('keepalive')
where exists (select 1 from cron.job where jobname = 'keepalive');

select cron.schedule(
  'keepalive',
  '0 6 */3 * *',
  $$ insert into public.keepalive (id, pinged_at) values (1, now())
     on conflict (id) do update set pinged_at = excluded.pinged_at; $$
);
