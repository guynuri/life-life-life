-- Mood colors (SPEC 4). One row per owner per day; a blank day is not stored.
-- user_id is the owner column (the spec's owner_id). (user_id, day) is the primary key, so it is unique per owner per day.

alter table public.moods alter column color drop not null;

do $$
begin
  alter table public.moods
    add constraint moods_color_check
    check (color is null or color in ('coral', 'orange', 'yellow', 'green', 'blue', 'purple'));
exception when duplicate_object then null;
end $$;

-- Idempotent: safe to re-run. RLS policy "owner only" already exists from 0001.
grant select, insert, update, delete on public.moods to authenticated;
