-- Optional topic on a task, and the window (in days) that a big task's sessions spread over.
-- Big tasks must say how many days to spread over; other kinds leave it null.

alter table public.tasks
  add column if not exists topic text,
  add column if not exists spread_days integer check (spread_days > 0),
  add constraint big_tasks_need_spread check (kind <> 'big' or spread_days is not null);
