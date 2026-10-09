-- Phase 3: Google Calendar. One session is one event (SPEC 1); the event id is stored on the session.
-- Requires 0005_scheduler.sql. No new table, so no grant is needed (sessions already has grants).
-- Sessions placed before this migration have no event id and get no event.

alter table public.sessions add column if not exists calendar_event_id text;
