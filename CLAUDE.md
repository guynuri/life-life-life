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

## Not built yet (next agents)

- `web/src/lib/gcal.ts`: Calendar read, free/busy, create/update events, sync of moved app-created events.
- `web/src/lib/scheduler.ts`: pure function (tasks, free slots, conditions) to placements. Needs an assert-based check.
- `web/src/lib/conditions.ts`: at-work check. Work hours are Sun-Thu 09:00-19:00; anything not at work counts as home. Fri and Sat are days off.
- `web/src/ui/*`: today view, tasks, people, mood grid with zoom levels (daily color; optional hourly deferred; zoom-out aggregates finer blocks).
- `supabase/functions/push/` and a `pg_cron` migration for reminders.
- iOS icon: `apple-touch-icon` needs a PNG. Only the SVG icon exists now.

## Setup the owner must do

1. Create a Supabase project. Put its URL and publishable key (Project Settings, API Keys) in `web/src/lib/config.ts`. These are public values, safe to commit. Never put the secret or service-role key in the repo or the browser.
2. Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (or with the Supabase CLI).
3. In Supabase Auth, enable the Google provider. Give it a Google OAuth client ID and secret. Add the Supabase callback URL to the Google OAuth client's redirect URIs.
4. In Supabase Auth → URL Configuration, add `http://localhost:5173/**` and the GitHub Pages URL (`https://guynuri.github.io/life-life-life/**`) to Redirect URLs. Set Site URL to the Pages URL. Supabase falls back to the Site URL if the app's `redirect_to` isn't allowlisted, which causes 404s.
5. In the repo settings, set Pages source to "GitHub Actions".

Status: steps 1 and 3 are done, and Google sign-in works locally. Steps 4 and 5 still need to be confirmed for production.

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

- TypeScript strict mode. Run `npm run build` in `web/` (type check plus bundle) before committing.
- Keep logic that can be tested (scheduler, conditions) free of DOM and network calls.
- Secrets never go in the repo.
