-- UI redesign: the lunch window is editable in settings (SPEC 2.4). Defaults 12:00 to 13:30. Grants on work_settings are from 0005.
alter table public.work_settings
  add column if not exists lunch_start_min integer not null default 720 check (lunch_start_min >= 0 and lunch_start_min < 1440),
  add column if not exists lunch_end_min integer not null default 810 check (lunch_end_min >= 0 and lunch_end_min < 1440);
