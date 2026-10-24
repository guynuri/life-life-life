-- These columns already exist in the live database, but no earlier migration created them.
-- This makes the history match. Idempotent: safe to run where they already exist.
alter table public.tasks
  add column if not exists done boolean not null default false,
  add column if not exists priority text not null default 'normal',
  add column if not exists position integer not null default 0;

alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('high', 'normal', 'low'));
