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

## Build plan

Build from `SPEC.md`, one PR per phase, in this order. Phases marked "parallel" have no shared state and can run on separate branches at the same time.

1. Data and tasks: migrations for tasks and people fields, task CRUD, Tasks screen (SPEC 2.1, 2.6, 2.7, 3.1, 3.4). Parallel with 4 and 5.
2. Scheduler: pure, DOM-free and network-free placement logic (SPEC 2.2 to 2.5, 2.4 work/home and Work day rules). Depends on 1.
3. Google Calendar: create, move, and delete events; sync on refresh (SPEC 1). Depends on 2.
4. People: due rule, Due now and Everyone lists, actions (SPEC 3). Parallel with 1 and 5.
5. Mood colors: day picker, zoom levels, averaging (SPEC 4). Parallel with 1 and 4.
6. Reminders: Web Push, Edge Function, pg_cron keepalive, settings for the contact reminder time (SPEC 5). Depends on 2 and 4.
7. Today view (SPEC 6). Depends on 2 and 4.

Each phase needs unit tests for its pure logic and at least one Playwright flow for its screen.

## Not built yet

The features in `SPEC.md` are not built. Also not built:

- iOS icon: `apple-touch-icon` needs a PNG. Only the SVG icon exists now.

## Local development

- `cd web && npm install && npm run dev`, then open http://localhost:5173/. Requires Node 20 or newer.
- Build check before committing: `npm run build` in `web/`.

## Known constraints

- Calendar access depends on the `calendar.events` scope being granted at sign-in. Confirm it under https://myaccount.google.com/permissions. The Google Calendar API must also be enabled in the Google Cloud project.
- Google access tokens expire after about an hour. Refreshing them needs the Google client secret, so the refresh step belongs in an Edge Function. Confirm the Supabase `provider_refresh_token` flow in a spike before building on it.
- Google OAuth apps in "Testing" status expire refresh tokens after 7 days. Decision: publish the OAuth app (move it out of "Testing"). This is a manual step in the Google Cloud console and is not done yet.
- Free Supabase projects pause after about 7 days of inactivity, which would stop reminders. Decision: a pg_cron keepalive job pings the database every few days. Do not upgrade to Pro.
- iPhone PWA push requires installing to the Home Screen (iOS 16.4+). No background location is possible; "at work" is inferred from the schedule.

## Conventions

- TypeScript strict mode, with `noUncheckedIndexedAccess`. Run `npm run build` in `web/` (type check plus bundle) before committing.
- `web/tslint.json` bans explicit `any` and enforces camelCase variables. TSLint is deprecated and is not installed, so nothing runs it yet.
- Keep logic that can be tested (scheduler, conditions) free of DOM and network calls.
- Table privileges are separate from RLS. Every new table needs `grant ... to authenticated` in its migration, or signed-in reads and writes fail with "permission denied".
- Use Vitest for unit tests, Testing Library for components, and Playwright for end-to-end flows. No console-log tests. Tests live in *.test.ts and run with npm test.
- Secrets never go in the repo.
