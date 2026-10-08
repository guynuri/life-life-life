-- Every table is per-user and locked to the signed-in owner via RLS.

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  kind text not null check (kind in ('big', 'work_day', 'scheduled_small')),
  duration_minutes integer,
  deadline timestamptz,
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  tier smallint not null check (tier between 1 and 3),
  interval_days integer,
  last_contacted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.moods (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  color text not null,
  primary key (user_id, day)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint text not null unique,
  keys jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;
alter table public.people enable row level security;
alter table public.moods enable row level security;
alter table public.push_subscriptions enable row level security;

create policy "owner only" on public.tasks for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner only" on public.people for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner only" on public.moods for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "owner only" on public.push_subscriptions for all using (user_id = auth.uid()) with check (user_id = auth.uid());
