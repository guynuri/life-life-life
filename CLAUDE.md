# life-life-life

Personal iPhone PWA that manages the things I forget: Google Calendar events, tasks that get scheduled automatically, people to stay in touch with, daily mood colors, and reminders. Single user (me). Feature requirements are in `SPEC.md`.

## Stack

- React + TypeScript app built with Vite, in `web/`. `vite-plugin-pwa` generates the manifest and service worker. Deployed to GitHub Pages by `.github/workflows/pages.yml` on push to `main` (Node 20, `npm run build`, publishes `web/dist`).
- Supabase: Postgres, Auth (Google sign-in), Edge Functions, `pg_cron`. Schema in `supabase/migrations/`.
- Google Calendar API v3 (`calendar.events` scope), called from the browser with the Google token.
- Web Push via service worker, sent by a Supabase Edge Function (not built yet).

## Layout

- `web/index.html`: Vite entry. `web/public/icon.svg`: app icon.
- `web/vite.config.ts`: React plugin and PWA manifest/service worker config.
- `web/src/main.tsx`: React root. `web/src/App.tsx`: sign-in with Google (requests calendar scope, offline access), sign-out, session display. `web/src/styles.css`: global styles.
- `web/src/lib/config.ts`: public Supabase URL and publishable key, plus the Calendar scope.
- `web/src/lib/supabase.ts`: Supabase client; `configured` is false while config is still placeholders.
- `supabase/migrations/0001_init.sql`: tables `tasks`, `people`, `moods`, `push_subscriptions`, all with RLS owner-only policies.

## Status: open PRs and what's left

Nothing from the feature PRs is merged yet. The product rules are in `SPEC.md`, including which ones are decided, assumed, or still open. Feature PRs (all open against `main`):

- #1 mood colors (`SPEC.md` §4). Adds the mood view and `moodMath.ts`. Also changes `SPEC.md`.
- #2 tasks, scheduler, and work-hours conditions (§2). Adds migration `0002_task_topic_and_spread.sql`.
- #3 an alternative scheduler and conditions (§2). Conflicts with #2 on the same files. Pick one before merging. #2 carries the owner's answers; #3's review suggests its field names match the tasks table, so it may be the better base.
- #4 people (§3). Adds migration `0002_people_grants.sql`.

Still not built, from any PR:

- Google Calendar read, free/busy, create/update, and sync (§1). The scheduler has no real free time yet.
- Push reminders: `supabase/functions/push/` and a `pg_cron` migration (§5).
- Today view (§6).
- iOS icon: `apple-touch-icon` needs a PNG. Only the SVG icon exists now.

## Setup the owner must do

1. Create a Supabase project. Put its URL and publishable key (Project Settings, API Keys) in `web/src/lib/config.ts`. These are public values, safe to commit. Never put the secret or service-role key in the repo or the browser.
2. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (or with the Supabase CLI).
3. In Supabase Auth, enable the Google provider. Give it a Google OAuth client ID and secret. Add the Supabase callback URL to the Google OAuth client's redirect URIs.
4. In Supabase Auth → URL Configuration, add `http://localhost:5173/**` and the GitHub Pages URL (`https://guynuri.github.io/life-life-life/**`) to Redirect URLs. Set Site URL to the Pages URL. Supabase falls back to the Site URL if the app's `redirect_to` isn't allowlisted, which causes 404s.
5. In the repo settings, set Pages source to "GitHub Actions".
6. Run `0002_people_grants.sql`. It grants table privileges to `authenticated` on `tasks`, `people`, `moods`, and `push_subscriptions`. It is idempotent. Applied and confirmed working for all four tables.
7. Run `0002_task_topic_and_spread.sql` (PR #2) before using the tasks list. Without it, inserts fail.

Status: steps 1, 3, and 6 are done, and Google sign-in works locally. Step 7 is pending. Steps 4 and 5 still need to be confirmed for production.

Migration numbering: `0002_people_grants.sql` reaches main when this PR merges. PR #2's `0002_task_topic_and_spread.sql` uses the same prefix; renumber it (for example to `0003`) when merging PR #2.

## Local development

- `cd web && npm install && npm run dev`, then open http://localhost:5173/. Requires Node 20 or newer.
- Build check before committing: `npm run build` in `web/`.

## Known constraints

- Calendar access depends on the `calendar.events` scope being granted at sign-in. Confirm it under https://myaccount.google.com/permissions. The Google Calendar API must also be enabled in the Google Cloud project.
- Google access tokens expire after about an hour. Refreshing them needs the Google client secret, so the refresh step belongs in an Edge Function. Confirm the Supabase `provider_refresh_token` flow in a spike before building on it.
- Google OAuth apps in "Testing" status expire refresh tokens after 7 days.
- Free Supabase projects pause after about 7 days of inactivity, which would stop reminders.
- iPhone PWA push requires installing to the Home Screen (iOS 16.4+). No background location is possible; "at work" is inferred from the schedule.

## Conventions

- TypeScript strict mode, with `noUncheckedIndexedAccess`. Run `npm run build` in `web/` (type check plus bundle) before committing.
- `web/tslint.json` bans explicit `any` and enforces camelCase variables. TSLint is deprecated and is not installed, so nothing runs it yet.
- Keep logic that can be tested (scheduler, conditions) free of DOM and network calls.
- Table privileges are separate from RLS. Every new table needs `grant ... to authenticated` in its migration, or signed-in reads and writes fail with "permission denied".
- Pure logic (scheduler, mood math, due rules) has an assert-based `*.check.ts`. Only `moodMath.check.ts` runs, through `npm run check` (PR #1). The others are not wired yet.
- Secrets never go in the repo.
