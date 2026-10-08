# life-life-life: feature spec

Personal iPhone PWA (single user) for the things I forget. Read `CLAUDE.md` for stack, layout, and setup first. Each feature below is a self-contained task area. Build only the area you're assigned and keep to the file layout in `CLAUDE.md`.

## 1. Google Calendar (`web/src/lib/gcal.ts`)

- Read events from the primary calendar and show them in the app. A refresh re-reads Google, so edits made in Google Calendar appear.
- Read free/busy data to find open slots for the scheduler.
- Create and update events for scheduled tasks. Each app-created event links back to its task.
- Sync rule, run on each refresh: if an app-created event moved, update the task's scheduled time to match. If it was deleted, mark the task unscheduled. Edits in Google do not change the task otherwise.
- Uses the Google token from the Supabase session. Needs `calendar.events` scope (already requested at sign-in).
- Open: the Google access token expires after about an hour, and Supabase only returns it at sign-in. Spike the refresh flow before relying on it. Refresh needs the Google client secret, so it belongs in an Edge Function.

## 2. Tasks and scheduling (`web/src/lib/scheduler.ts`, `web/src/lib/conditions.ts`)

Task model: title, kind (`big` = multi-session, `work_day` = any time on a work day, `scheduled_small` = a short fixed-length item like shopping), duration, deadline, optional topic, conditions. Tasks can be grouped into topics.

- Scheduling is fully automatic. Every placement on the calendar is announced to me, and I can move or undo any placement.
- Big tasks split into several sessions spread over the time before the deadline.
- `scheduler.ts` is a pure function: (tasks, free slots, conditions, now) → placements. No DOM or network calls. Keep it testable.
- `conditions.ts` decides the "at work" state:
  - Work hours: Sunday to Thursday, 09:00 to 19:00.
  - Anything not scheduled for work hours counts as home. Fri and Sat are days off.
  - Work tasks are placed only during work hours. Study tasks are placed only at home.
- Check: an assert-based script covering placements, the work-hours rule, and the weekend rule.

## 3. People and reach-outs (`web/src/ui/people/*`)

- Each person has a name, a tier (1 to 3), an optional interval override in days, and a last-contacted date.
- Each tier has a default interval, for example tier 1 every 7 days. A person's override wins.
- The list shows who is due now, ordered by tier, then by how overdue they are.
- Marking someone as contacted resets their timer.
- Reminders for due people use the reminders feature below.

## 4. Mood colors (`web/src/ui/mood/*`)

- One color per day, set by tapping a day. This is optional, so days can be left blank.
- Hourly logging is out of scope for v1.
- Zoom-out view: show days, then weeks, months, and years. When a level has too many blocks for the screen, combine the blocks from the level below into one color for each parent block.
- Stored in the `moods` table, one row per user per day.

## 5. Reminders (`web/src/lib/push.ts`, `web/public/`, `supabase/functions/push/`)

- Web Push via the service worker. Sends happen from a Supabase Edge Function, triggered on a schedule by `pg_cron`.
- Works only after the app is added to the Home Screen (iOS 16.4 or newer). The app should explain this when push is enabled.
- Subscriptions are stored in `push_subscriptions`.
- Reminders cover task sessions that are about to start, announcements of new placements, and people who are due.
- Not built yet, and waits on the Edge Function setup.

## 6. Today view and app shell (`web/src/ui/today/*`)

- Home screen: today's placed sessions, due people, and today's mood color.
- Sign-in and sign-out already exist in `web/src/App.tsx`. Keep them working.

## Out of scope for v1

- Location tracking or background location. "At work" comes from the schedule.
- Two-way sync of events that the app did not create.
- Hourly mood logging.
- Learning from my habits to improve scheduling.
- Native iOS app.

## Assignment format

When you give an agent a task, name the feature number, the files it may touch, and whether it can change shared files (`App.tsx`, `config.ts`, `CLAUDE.md`, `supabase/migrations/`). Shared files should go to one agent at a time.
