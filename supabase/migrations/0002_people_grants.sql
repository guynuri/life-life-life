-- RLS alone does not grant table privileges; without these, signed-in reads fail with "permission denied".
-- Idempotent: safe to re-run on a project where the people-only grant was already applied.
grant select, insert, update, delete on public.tasks, public.people, public.moods, public.push_subscriptions to authenticated;
