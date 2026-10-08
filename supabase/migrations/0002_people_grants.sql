-- The people table has RLS but no table privileges for signed-in users, so reads fail with "permission denied".
grant select, insert, update, delete on public.people to authenticated;
