-- Phase 2: scheduler. Each placement is one row in sessions (a big task has several).
-- Requires 0003_tasks.sql. Column names start_at/end_at because "end" is a reserved word.
-- work_settings holds one row per owner with editable work hours (SPEC 2.4); no row means the defaults (09:00 to 19:00).

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  task_id uuid not null references public.tasks(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  constraint sessions_time_check check (end_at > start_at)
);

create table if not exists public.work_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  start_min integer not null default 540 check (start_min >= 0 and start_min < 1440),
  end_min integer not null default 1140 check (end_min > start_min and end_min <= 1440)
);

alter table public.sessions enable row level security;
alter table public.work_settings enable row level security;

create policy "owner only" on public.sessions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner only" on public.work_settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

grant select, insert, update, delete on public.sessions, public.work_settings to authenticated;
