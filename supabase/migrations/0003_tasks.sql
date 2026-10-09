-- Phase 1: reshape the tasks table from 0001 to the v1 task fields (SPEC 2.1) and add placement columns for phases 2-3.
-- Assumes 0001_init.sql has been applied. The old tasks table is renamed in place, so its RLS policy follows the renamed column.
-- Fails loudly if existing rows have a null duration or an unknown kind; fix those rows first.

alter table public.tasks rename column user_id to owner_id;
alter table public.tasks rename column kind to type;
alter table public.tasks rename column duration_minutes to duration_min;
alter table public.tasks drop column conditions;

update public.tasks set type = 'short_fixed' where type = 'scheduled_small';
alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_type_check check (type in ('big', 'work_day', 'short_fixed'));

alter table public.tasks alter column duration_min set not null;
alter table public.tasks add constraint tasks_duration_min_check check (duration_min > 0);
alter table public.tasks add constraint tasks_title_check check (length(btrim(title)) > 0);

alter table public.tasks
  add column topic text,
  add column spread_days integer,
  add column condition_place text not null default 'any',
  add column held boolean not null default false;

alter table public.tasks add constraint tasks_spread_days_check check (spread_days is null or spread_days > 0);
alter table public.tasks add constraint tasks_big_spread_check check (type <> 'big' or spread_days is not null);
alter table public.tasks add constraint tasks_condition_place_check check (condition_place in ('any', 'work', 'home'));
alter table public.tasks add constraint tasks_work_day_place_check check (type <> 'work_day' or condition_place = 'work');

grant select, insert, update, delete on public.tasks to authenticated;
