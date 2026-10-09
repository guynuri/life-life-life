-- People (SPEC 3). The people table exists from 0001; this only tightens it.
-- Column names stay as in 0001: interval_days (the override) and last_contacted_at.
-- Grants for people are already in 0002; RLS owner-only is unchanged.

alter table public.people alter column tier set default 2;

alter table public.people
  add constraint people_interval_days_min check (interval_days is null or interval_days >= 1);

alter table public.people
  add constraint people_name_not_blank check (btrim(name) <> '');
