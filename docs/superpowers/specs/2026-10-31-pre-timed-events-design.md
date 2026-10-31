# Pre-timed events: design

Status: approved by the requester. Nothing is built yet; the plan comes next.

## Intent and why

Adding a fixed-time event in Google Calendar takes too many fields. Most of the time I only want to set a title, a time, and a category. The category already decides the calendar, and the calendar already has its own default reminders. The app should let me add a fixed-time event (a haircut, a meeting with friends) with just those inputs, and the event should then take up time in my schedule so the scheduler works around it.

## Goals

- Create a fixed-time event from the app with: title, start (date and time), duration in minutes, and category.
- The category is a Google calendar. The event goes on that calendar and gets that calendar's default reminders with no extra input.
- Pre-timed events count as busy time for the scheduler, so placed tasks avoid them.
- Events show up in the app after a refresh, like other calendar events.

## Non-goals

- Guests, location, description, recurrence, and colors. Not in this version.
- Creating or changing categories. The categories are the calendars I already have in Google.
- Push reminders from the app for pre-timed events. Google's own reminders cover them.

## Anti-goals

- The form must not ask for anything beyond the title, start, duration, and category. If a field is added later, it has to be optional and hidden by default.
- The scheduler must never move or delete a pre-timed event. Those are mine, not the app's.

## Constraints

- Google Calendar API v3 with the `calendar.events` scope, called from the browser with the Google token (existing setup).
- All times are the device's local time (SPEC principles).
- Table privileges: if any new table is added, it needs `grant ... to authenticated`. This design adds no table.
- Pure logic (duration math, busy-time merging, category filtering) stays free of DOM and network calls, with unit tests.

## Decided by the requester

- The form takes a title, a start time, a duration in minutes, and a category. No end-time field.
- A category is a Google calendar, and its default reminders apply to the event.
- The event can be edited (title, start, duration, category) and deleted from the app.
- A pre-timed event appears on the Today view as a fixed item, and it also blocks time for placed tasks.

## Decided for you (my calls, to check while reading)

1. **Where the event lives.** The event is created in Google Calendar only. The app does not keep its own copy. A refresh reads it back the same way it reads other events.
2. **How the app knows it made the event.** The event is tagged with a private extended property (for example `lifeKind = fixed`). This lets the app show it as "created here" without changing how Google treats it.
3. **Reminders.** The event is created with `reminders.useDefault = true`, so Google applies the calendar's default reminders. The app does not send its own reminders.
4. **Which calendars are offered.** The category picker lists every calendar from `calendarList` where the user can write events. Read-only calendars, such as holiday or shared calendars, are not offered as categories.
5. **Busy time.** The scheduler reads busy time from all calendars in the calendar list, not only the primary calendar as the current spec says. Otherwise a haircut on another calendar would not block a session. This changes SPEC section 1 ("Read busy times") and must be updated there.
6. **Pre-timed events are never placed over.** They are treated as fixed busy blocks. The scheduler works around them.
7. **Start and duration.** The start is a date and time in local time. Duration is a whole number of minutes, 5 or more. The form defaults to the next half hour and 60 minutes.
8. **Past times.** A start in the past is refused with a message, so the form cannot create an event that is already over.
9. **Failure.** If the Google write fails, the form stays open with the error shown (SPEC principle: failures are shown, not swallowed). Nothing is shown as saved until Google confirms it.
10. **Where the form lives.** A button on the Today tab opens the form. It is not a new tab.

## Parts of the how

- **Form:** title (required), start date and time (required), duration in minutes (required), category (required, default to the primary calendar).
- **Create:** one `events.insert` call on the chosen calendar, with summary, start, end (start plus duration), `reminders.useDefault: true`, and the private extended property from call 2.
- **Edit:** a form pre-filled from the event. Title, start, and duration use `events.patch`. A category change uses `events.move` to the new calendar. Edits follow the same failure rule as create.
- **Delete:** `events.delete` on the event's calendar, after a confirmation prompt.
- **Read back:** the existing refresh reads events from each calendar in the list, not only primary. Events with the property show as fixed events.
- **Scheduler input:** busy intervals from all calendars feed the existing placement logic. No change to the scheduler rules otherwise.

## Left to the builder

- The exact date and time input control. Native `datetime-local` is preferred if it works well on iPhone.
- How the calendar list is cached between refreshes.
- How a fixed event is shown on Today, following the existing Today spec (section 6, not reread for this design).
- Whether edits to a pre-timed event made in Google Calendar are re-read on refresh. They should be, because Google wins.
- Test plan: unit tests for duration and busy-time merging, and one Playwright flow for create-then-see-on-refresh.

## Answered by the requester

1. Edit and delete from the app: yes.
2. Shows on Today and blocks time: both.
