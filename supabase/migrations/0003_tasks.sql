-- Phase 1: reshape the tasks table from 0001 to the v1 task fields (SPEC 2.1) and add placement columns for phases 2-3.
-- Assumes 0001_init.sql has been applied. The old tasks table is renamed in place, so its RLS policy follows the renamed column.
-- Fails loudly if existing rows have a null duration or an unknown kind; fix those rows first.
-- Safe to re-run: each step checks whether it is still needed, so a database that already has these changes is left as it is.

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'user_id') then
    alter table public.tasks rename column user_id to owner_id;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'kind') then
    alter table public.tasks rename column kind to type;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tasks' and column_name = 'duration_minutes') then
    alter table public.tasks rename column duration_minutes to duration_min;
  end if;
end $$;

alter table public.tasks drop column if exists conditions;

update public.tasks set type = 'short_fixed' where type = 'scheduled_small';
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check check (type in ('big', 'work_day', 'short_fixed'));

alter table public.tasks alter column duration_min set not null;
alter table public.tasks drop constraint if exists tasks_duration_min_check;
alter table public.tasks add constraint tasks_duration_min_check check (duration_min > 0);
alter table public.tasks drop constraint if exists tasks_title_check;
alter table public.tasks add constraint tasks_title_check check (length(btrim(title)) > 0);

alter table public.tasks
  add column if not exists topic text,
  add column if not exists spread_days integer,
  add column if not exists condition_place text not null default 'any',
  add column if not exists held boolean not null default false;

alter table public.tasks drop constraint if exists tasks_spread_days_check;
alter table public.tasks add constraint tasks_spread_days_check check (spread_days is null or spread_days > 0);
alter table public.tasks drop constraint if exists tasks_big_spread_check;
alter table public.tasks add constraint tasks_big_spread_check check (type <> 'big' or spread_days is not null);
alter table public.tasks drop constraint if exists tasks_condition_place_check;
alter table public.tasks add constraint tasks_condition_place_check check (condition_place in ('any', 'work', 'home'));
alter table public.tasks drop constraint if exists tasks_work_day_place_check;
alter table public.tasks add constraint tasks_work_day_place_check check (type <> 'work_day' or condition_place = 'work');

grant select, insert, update, delete on public.tasks to authenticated;
