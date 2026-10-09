-- SPEC 5 reminders: pg_cron calls the send-reminders Edge Function every minute.
-- NOT a migration: it holds placeholders, so run it by hand once, after the function is deployed.
--
-- Before running, replace the two placeholders:
--   <FUNCTION_URL>  https://<project-ref>.supabase.co/functions/v1/send-reminders
--   <REMINDER_SECRET>  the same value you set as the REMINDER_SECRET function secret
-- The function checks the x-reminder-secret header. Deploy it with --no-verify-jwt (see the report).
-- Do not commit the filled-in version.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule('send-reminders')
where exists (select 1 from cron.job where jobname = 'send-reminders');

select cron.schedule(
  'send-reminders',
  '* * * * *',
  $$
  select net.http_post(
    url := '<FUNCTION_URL>',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-reminder-secret', '<REMINDER_SECRET>'),
    body := '{}'::jsonb
  );
  $$
);
