-- Tasks page redesign (SPEC 2.7): a done state and a priority. Priority is a tiebreaker after deadline (SPEC 2.3).
-- Done tasks are never placed. Grants on tasks are from 0003_tasks.sql.
alter table public.tasks
  add column if not exists done boolean not null default false,
  add column if not exists priority text not null default 'normal';

alter table public.tasks drop constraint if exists tasks_priority_check;
alter table public.tasks add constraint tasks_priority_check check (priority in ('high', 'normal', 'low'));
