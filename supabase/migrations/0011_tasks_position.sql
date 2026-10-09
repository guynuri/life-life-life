-- Tasks page (SPEC 2.7, assumed): manual display order, set by Move up and Move down. Display only: placement order
-- is still deadline, then priority. Grants on tasks are from 0003_tasks.sql.
alter table public.tasks add column if not exists position integer not null default 0;
