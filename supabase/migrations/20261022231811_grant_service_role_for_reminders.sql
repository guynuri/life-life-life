-- The send-reminders Edge Function runs as service_role and reads/writes across owners (bypasses RLS).
-- Without these grants its first query fails and the function returns 500.
grant select, insert, update, delete on public.push_subscriptions, public.work_settings, public.people, public.sessions, public.tasks, public.reminders to service_role;
