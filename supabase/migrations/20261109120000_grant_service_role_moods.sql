-- The 22:00 mood reminder (PR #41) made send-reminders read public.moods, but service_role had no grant on it.
-- Every run failed with "permission denied for table moods", so no reminder of any kind was sent.
grant select on public.moods to service_role;
