-- Security hardening: revoke anon table grants, tie sessions to the owner's tasks,
-- and require https push endpoints. Requires 0001 through 0008.

-- 1. Supabase grants table privileges to anon by default. RLS already returns no rows to anon,
--    but anon has no use for these tables, so remove the privilege. The app only needs authenticated.
revoke all on public.tasks, public.people, public.moods, public.push_subscriptions,
  public.sessions, public.work_settings, public.reminders from anon;

-- 2. A session must point at a task the same owner owns. Before this, a signed-in user could
--    insert a session with another user's task_id. The reminder Edge Function reads with the
--    service role and embeds tasks(title), so that title would appear in the user's own push.
drop policy if exists "owner only" on public.sessions;
create policy "owner only" on public.sessions for all
  using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.tasks t where t.id = task_id and t.owner_id = auth.uid())
  );

-- 3. Push endpoints are URLs the Edge Function POSTs to. Only https endpoints are accepted.
do $$
begin
  alter table public.push_subscriptions
    add constraint push_subscriptions_endpoint_https check (endpoint like 'https://%');
exception when duplicate_object then null;
end $$;
