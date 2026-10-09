# life-life-life: product spec

Personal iPhone PWA (single user) for the things I forget. This spec says what the app should do. The code is being rewritten from this spec. Setup, stack, and status are in the project's setup notes.

## How to read this spec

Every behavior is tagged with where it came from:

- **[Decided]**: I confirmed it, in the original spec or in questions in other branches.
- **[Assumed]**: someone (an agent or the spec writer) chose it. Build it this way unless I say otherwise.

Where this spec differs from the original spec, the change is listed under "Changes from the original spec" at the end.

## Principles

- Scheduling is automatic, but nothing happens silently. Every placement is announced, and I can move or undo it. [Decided]
- Edits I make in Google Calendar win over the app for times. The app only changes events it created itself. [Decided]
- A failed save or a failed read is shown to me. It is never swallowed, and the screen shows what is actually stored, not what I tried to save. [Assumed]
- All times are the device's local time. Sessions keep their wall-clock time across daylight-saving changes. [Decided]

## Pages

- [Decided] The app is one page with five tabs: Today, Tasks, People, Mood, Settings. Each tab has its own URL: #/today, #/tasks, #/people, #/mood, #/settings. Opening a tab adds a history entry, so back, forward, and reload keep the open tab. An empty or unknown hash opens Today.
- [Decided] The five tabs sit in a bottom tab bar. Each tab shows an icon with a short label. The tab bar is the only navigation.
- [Decided] The top bar is slim: the app name and an icon-only Refresh button (labelled "Refresh" for screen readers) on every page. Refresh re-reads Google, runs placement, and then reloads the stored data on every page.
- [Decided] Sign-in and sign-out stay on the page. Sign-out is on the Settings page.
- [Decided] Layout is phone first: one column, about 390px wide, with touch targets of at least 44px. On wider screens the content is centred at about 480px, and the tab bar matches that width.
- [Decided] Visual direction: pastel and calm. The base is neutral, in light and dark mode. Each page has one pastel accent family; the accent carries the page's identity and the surfaces stay neutral. Settings and the tab bar use the base family, a pastel peach. Primary buttons take the page accent with dark ink on the fill; secondary buttons are outlines in the accent text colour. Headings use Bricolage Grotesque and body text uses Figtree. Each page has a clear type scale, and text stays under about 80 characters a line. The six mood colours in section 4 are unchanged. Dark mode follows the system setting unless the reader picks Light or Dark in Settings.
- [Decided] The Today page opens with a hero card: a time-appropriate greeting and the session in progress or the next one.
- [Decided] Today updates live. Writes to tasks, people, and moods, and each placement run, tell Today to reload, and Today reloads when its tab becomes active. The Refresh button stays.
- [Decided] Each page sets its own pastel accent: Today blue, People rose, Mood lilac, Tasks mint. Settings and the tab bar use the peach base. Each accent is a set of tokens, and dark mode has its own values.
- [Decided] Dropdowns are custom lists in a popover, not the browser's native select. Dates are picked in a calendar popover. Times are picked in a popover list of 15-minute steps, in the same style as the dropdown. The native time picker is not used.
- [Decided] The selected option in a dropdown or time list is tinted with the page accent, so it is visible in light and dark mode. The menu panel uses the surface colour.
- [Assumed] The values: neutral base light #FAF8F5, surface #F0ECE7, ink #2F2A33; dark #17141A, surface #231E27, ink #F2EEF4. Page accents (fill, ink on the fill, text): Today blue #B5D0F7 / #1B2C4D / #3A66B3; People rose #F7C6D2 / #4D1C2C / #A23B5F; Mood lilac #D7C8F5 / #2F1F52 / #6A4AAE; Tasks mint #BDE8D0 / #163D2A / #2D7550; Settings and the tab bar peach #F6C4A5 / #4A2A1A / #A0522D. Dark mode uses deeper variants of each family. Text on each surface is checked for contrast.
- [Assumed] The calendar popover uses react-day-picker, a small dependency styled with our tokens.
- [Assumed] When a date is picked without a time, a deadline's time is 23:59.
- [Assumed] The hero card gradient runs from a deeper orange (#E0560A) to deep purple, so white text meets contrast requirements. The vivid orange is used for buttons and highlights.
- [Assumed] Cards (list rows and settings sections) use a restrained radius and a faint purple-tinted shadow. Other elements are not cards.
- [Assumed] A single entrance animation plays on the Today hero. Motion is turned off when the system asks for reduced motion.
- [Decided] Settings page contents, in order: appearance (System, Light, or Dark; System is the default); work hours (start and end, editable); lunch (start and end, editable); contact reminder time (default 19:00); notifications (turn on or off, with the current state); Google Calendar (connection status and a Reconnect Google action); account (sign out).
- [Assumed] Lunch must fall inside work hours, and each lunch end must come after its start. Work must end after it starts.
- [Assumed] Google Calendar status reads as connected when the signed-in session carries a Google provider token.
- [Decided] The theme choice is System (default), Light, or Dark. It applies at once and is applied before first paint, so there is no flash of the wrong theme.
- [Assumed] The theme choice is saved in localStorage under the key life-theme. Storage is read and written inside try/catch: if storage is unavailable the page still renders, and the choice lasts only for that page view.
- [Decided] Every form field shows a lucide icon next to its label. Selects use a custom chevron. Date and time fields keep the native picker, which matches the theme, and share the text input height, radius, and border.
- [Decided] Each Settings section saves on its own. A successful save shows a visible success message; a failed save shows the error. Nothing fails silently.

## 1. Google Calendar

- Read events from my primary calendar. A refresh re-reads Google, so edits I make there appear in the app. [Decided]
- Read busy times to find open slots for the scheduler. [Decided]
- Create calendar events for scheduled tasks. Each app-created event links back to its task. [Decided]
  - One event per session, titled with the task's title. [Assumed]
- Sync on each refresh: [Decided]
  - If an app-created event was moved, the task's scheduled time moves to match. The move is accepted even if the new time breaks the task's Condition (for example, a Work task moved to 21:00). [Decided]
  - If an app-created event was deleted, the task becomes unscheduled.
  - Other edits to events are ignored.
- After I delete an app-created event, its task stays unscheduled and is held out of automatic placement until I reschedule it. [Decided]
- Unscheduling or deleting a task updates Google Calendar: its calendar events are removed. [Decided]
- Editing the duration or deadline of a placed task removes its calendar events first, then the sessions, and placement runs again. [Decided]
- Busy times are read for the whole window in which each unplaced task can be placed, not a fixed span. [Decided]
- Work day tasks create no calendar events. [Decided]
- With no Google access, no placement runs, including for Work day tasks. [Decided]
- Sign-in requests calendar access. [Decided]
- The Google OAuth app is published (out of "Testing"), so access does not lapse after 7 days. [Decided]
- If Google access can no longer be refreshed, the app shows a "Reconnect Google" prompt. It does not fail silently. [Decided]

## 2. Tasks and scheduling

### 2.1 Task fields

- **Title**, required. [Assumed]
- **Type**, required. Three types: [Decided] (the field was called "Kind"; renamed to "Type")
  - *Big*: a task that takes several sessions, spread over time. [Decided]
  - *Work day*: a task done on a work day (Sunday to Thursday). It has no time slot; see 2.4. Its Condition is always Place = Work. [Decided]
  - *Short fixed item*: a short task of a fixed length, like shopping. [Decided]
- **Duration** in minutes, required. For a big task, this is the total time across all its sessions. [Assumed]
- **Topic**, optional free text. Blank means no topic. Shown on the task. [Decided]
- **Deadline**, optional. The latest time the task may be done. [Assumed]
- **Spread over (days)**, required for a big task. [Decided] Not used for other types. [Assumed]
- **Condition**, optional. A condition limits where a task can go. The only condition for now is **Place**: Any (default), Work, or Home. [Decided]

### 2.2 Big tasks: sessions and the spread window

- [Decided] The spread window runs from now until the earlier of the deadline and now plus "Spread over (days)". A deadline earlier than the spread window wins.
- [Assumed] The sessions are spaced evenly across the spread window.
- [Decided] Sessions are 60 minutes by default. If the task does not fit that way, each session is made longer, on average, so the task fits. There is no maximum session length. [Decided]
- [Assumed] No two sessions of the same big task fall on the same day.
- [Assumed] If the task still cannot fit, none of its sessions are placed, and the task shows as unplaced.
- [Assumed] If the spread window has fewer days than sessions, the sessions are made longer so that the task fits in the days available.

### 2.3 Order and when placement runs

- Tasks are placed earliest deadline first. Tasks with no deadline are placed after those with one. [Assumed]
- Priority breaks ties after the deadline: high before normal before low. Tasks with the same deadline and priority keep their order. [Assumed]
- Done tasks are never placed (see 2.7). [Assumed]
- Placement runs on every refresh and after any task change, for tasks that are not placed and are not held out (see 2.5). [Decided]

### 2.4 Work and home

- Work hours: Sunday to Thursday, 09:00 to 19:00 local time. [Decided]
- Work hours are editable. [Decided] Where I edit them is [Assumed]: in the app's settings.
- Lunch, 12:00 to 13:30, is not available work time. It is excluded from the work hours used for scheduling. [Decided]
- Friday and Saturday are days off. [Decided]
- Any time outside work hours counts as home. [Decided]
- **Work day** tasks have no time slot, so the lunch window does not apply to them. The scheduler assigns each one to a work day, and their durations add up within that day, so a day can hold several tasks and still have time left. [Decided]
  - Each work day keeps about 2 hours of work time open as a hard reserve (assumed to be the last 2 hours before 19:00). Work day tasks never fill it. [Decided, reserve window Assumed]
  - If a Work day task does not fit on its assigned day, it moves to another day in its window, before its deadline if one is set. [Decided]
  - If it still cannot fit by its deadline, it is unplaced and I am notified (section 5). [Decided]
- The **Place** condition limits where a task goes. [Assumed]
  - Work: every minute of the placement falls in work hours.
  - Home: every minute falls outside work hours.
  - Any: no limit.
  - When a place is set, a placement never straddles the boundary.
- A session with Place = Any may cross the work/home boundary. It is shown as one session, not split. [Assumed]

### 2.5 Announcements, changes, and holds

- [Decided] Every new placement is announced to me. Delivery is covered by the reminders feature, section 5.
- [Decided] I can move or undo any placement.
- [Decided] Undo returns the task to unscheduled. The task is then held out of automatic placement until I reschedule it. The same hold applies after I delete its calendar event (section 1).
- [Decided] I move a session by tapping it and choosing a new time. Undo unschedules it. A "Schedule" action on the task releases the hold.
- [Decided] Editing the duration or deadline of a placed task replaces its placement: its sessions are removed and the task is placed again in the next placement run.
- [Decided] Work day sessions cannot be moved to another day in the UI, for now.
- [Decided] Each task has an "Unschedule" button and a "Delete task" button. Both update Google Calendar accordingly.

### 2.6 Unplaced and unscheduled tasks

- [Assumed] A task that cannot be placed is unplaced. It stays on the Tasks screen, marked as unplaced.
- [Assumed] A task I unscheduled (by undo or by deleting its event) is unscheduled, not unplaced. It stays on the Tasks screen, marked as unscheduled, until I reschedule it.

### 2.7 Tasks screen

- Active tasks are one list in manual order. A new task goes to the end. A grip on each row drags it to a new place: the row follows the pointer, the rows in between make room, and a drop settles into its slot. It uses pointer events with pointer capture, so it works with a finger. Move up and Move down in the three-dot menu do the same from the keyboard. Manual order is display only: placement still uses the deadline, then priority. [Assumed]
- Each row is a flat line: a round completion control on the left, the title, and one line of metadata with topic (if any), type, spread (for big tasks), deadline (if any), and status: placed, unplaced, unscheduled (held), or done. Priority is not written out. A high-priority row has a coral edge, and a low-priority row a muted edge; a normal row has none. The edge has a name for screen readers. A three-dot menu holds Edit, Move up and Move down, Schedule or Unschedule, and Delete task. [Assumed]
- I add a task from a plus button, in a sheet. The add form puts title, type, and duration first, and spread days for a big task (it is required). Topic, deadline, place, and priority are under More details, collapsed by default. [Assumed]
- Deleting asks for confirmation. [Assumed]
- Topics are a label only. Grouping tasks under topics is not built. [Decided]
- Editing a task after creation: title, duration, and deadline. [Decided]
- Priority is set in the add form (default Normal) as three choices, each with a dot, and in the edit sheet. It breaks ties after the deadline in placement. [Assumed]
- Completing a task marks it done at once: the row moves when it is pressed, and the save runs in the background. If the save fails, the row goes back and the error is shown in the list. Done tasks are in a Done (n) accordion at the bottom, collapsed by default. Completing a task removes its sessions and calendar events and it is not placed again; marking it not done places it again. [Assumed]
- Priority is high, normal, or low. A new task is normal. [Assumed]
- Type and spread days are set at creation and cannot be changed afterward. [Decided]
- Place and topic are also set at creation only. [Assumed]

## 3. People and reach-outs

### 3.1 Person fields

- **Name**, required. [Assumed]
- **Tier**, 1 to 3, required. New people default to tier 2. [Assumed]
- **Interval override** in days, optional. Must be a whole number, 1 or more. [Assumed] A blank field means use the tier default.
- **Last contacted**, optional. [Assumed]

### 3.2 Due rule

- Tier default intervals: tier 1 every 7 days, tier 2 every 14 days, tier 3 every 30 days. [Decided]
- A person's override, when set, wins over the tier default. [Decided]
- A person who has never been contacted counts from the day they were added. They become due one interval after I add them. [Decided]
- A person is due when the time since their last contact (or since they were added) reaches their interval. [Assumed]
- A person who becomes due triggers a reminder to contact them (section 5).

### 3.3 Lists

- One list, with no sub-tabs. Two groups, [Decided]:
  - People who need contact (due): an empty grey heart, at the top.
  - People who do not need contact (not due): a full heart, at the bottom, greyed out as a block (muted text on a lower-contrast surface).
  - Within each group, order by last contacted, oldest first. A person never contacted counts from the day they were added (3.2).
- Each row shows its tier and interval quietly. [Decided]
- The due list is recalculated each time the app opens or comes back to the foreground. It does not need a manual reload. [Assumed]

### 3.4 Actions

- [Decided] **Contacted** resets the person's timer to now.
- [Decided] **Contacted** is the heart at the end of the row, not in a menu. Pressing the heart on a due person marks them contacted: the heart fills in with the accent colour, a few small hearts float up and fade out (under about a second), and the row moves to the not-due group. With reduced motion on, only the filled heart shows. The heart can be pressed for any person, which resets the timer.
- [Assumed] The heart icons: an outline heart for a person who needs contact, a filled heart for one who does not. The exact icon is a choice; the state is what matters.

- [Assumed] Adding a person is in a sheet opened from a plus button. Edit and Remove are in each row's three-dot menu.
- **Remove** deletes the person. It asks for confirmation first. [Assumed]
- Editing a person after creation: name, tier, and interval. [Decided]

## 4. Mood colors

### 4.1 Setting a day

- One color per day. Tap a day to choose a color, or clear it. [Assumed] Days can be left blank. [Decided] Blank days are never counted as a color. [Decided]
- The palette is six pastel colors: coral, orange, yellow, green, blue, purple. [Decided]
- The day picker shows the date in a readable form, for example "Friday, October 9". [Assumed]
- A color is shown as saved only after it is stored. If the save fails, the day shows its previous stored state and the error stays visible until my next successful save. [Assumed]
- Hourly logging is out of scope for v1. [Decided]

### 4.2 Zoom levels

- Four levels, from finest to coarsest: day, week, month, year. [Decided]
- **Day**: every day of the month being viewed. [Assumed]
- **Week**: Sunday-start weeks that touch the month being viewed. [Assumed]
  - A week's label is its week number, counted by the week's Thursday. Week 1 is the first week whose Thursday falls in January. [Assumed]
  - A year that ends with a 53rd week shows week 53. [Decided]
- **Month**: the 12 months of the year being viewed. [Assumed]
- **Year**: 10 years ending with the year being viewed. [Assumed]
- Zoom with a pinch gesture inside the app: pinch out on a block to zoom in one level, pinch in to zoom out. [Decided] Drilling down stays inside the month being viewed: zooming into a week in October shows October's days only, so the days of September that fall in that week are not shown. [Assumed]
- Previous and next move by one month at the day and week levels, one year at the month level, and ten years at the year level. [Assumed]

### 4.3 Colors of coarser blocks

- [Decided] Zoomed-out blocks combine the blocks below them into one color, per the original spec.
- [Decided] The combined color is the average of the colors of the blocks directly below. Each level averages the level below.
- [Assumed] Blocks with no colored children have no color.
- [Decided] A week that touches two months counts toward both months.
- [Decided] A week's color is the average of all seven of its days, including days outside the month being viewed.
- [Decided] Colors are averaged channel by channel in RGB for now. A perceptual color space may come later.
- Each day's color is stored and survives reloads. [Decided]

## 5. Reminders

- [Decided] Reminders arrive as phone notifications, even when the app is closed.
- [Decided] Notifications work only after the app is added to the Home Screen (iOS 16.4 or newer). The app explains this when notifications are turned on.
- [Decided] Reminders keep working while the app is unused. The backend is kept awake, so it does not pause from inactivity.
- [Assumed] Each device that turns on notifications is registered separately.
- [Decided] Reminders cover:
  - [Decided] A task session, 10 minutes before it starts.
  - [Decided] New placements are announced. [Assumed] They are batched as one message per scheduler run.
  - [Decided] A person who becomes due, at the contact reminder time on the due day. The default is 19:00, and I can change it in settings. [Decided]
  - [Decided] Tasks that become unplaced because they cannot fit by their deadline. They are batched into the same message as new placements, once per scheduler run in which they newly become unplaced.
- [Assumed] "Notifications on" for a device means that device has a push subscription registered. Turning them off removes it.
- [Assumed] Reminder times use the time zone the device reports when it registers. The function uses the first registered device's zone for the owner.
- [Assumed] A session reminder is made when the session is 10 minutes or less from its start. Moving the session after that makes a new reminder.
- [Assumed] A due person is reminded once per due date (the first check at or after the reminder time on or after the due moment). Contacting them starts a new cycle.
- [Decided] A task with no deadline that becomes unplaced is not announced separately. Placement keeps retrying on each run, and a successful placement is covered by the normal placement message. Deadline tasks keep the unplaced message.
- [Decided] A reminder is marked sent only after at least one push succeeds. A reminder gets up to 3 attempts (one per run in which it fails), then it is marked failed. Expired device subscriptions are removed.
- [Assumed] The contact reminder time is stored with the work hours settings.

## 6. Today view

- [Decided] Shows today's placed sessions, the people who are due, and today's mood color.
- [Assumed] Each session shows its time, task title, and topic, in time order.
- [Assumed] Unplaced and unscheduled tasks are not shown on Today. They are on the Tasks screen.
- [Decided] Sign-in and sign-out already exist. Keep them working.
- [Assumed] Today is the first section on the signed-in screen, above the Tasks screen.
- [Assumed] "Today" is the device's local calendar day. A session is shown when it starts that day.
- [Assumed] Due people use the due rule in 3.2, the same as the Due now list. Someone who became due on an earlier day and was not contacted is still shown.
- [Assumed] Today shows the saved mood color for today, or "Not set" when the day is blank.
- [Assumed] Sessions, due people, and mood each load separately. A failed read shows an error in that part; the other parts still show. The stored data is what is shown, not what was attempted.
- [Assumed] Today re-reads when the app comes back to the foreground.

## Out of scope for v1

- Location tracking or background location. "At work" comes from the schedule. [Decided]
- Two-way sync of events the app did not create. [Decided]
- Hourly mood logging. [Decided]
- Learning from my habits to improve scheduling. [Decided]
- A native iOS app. [Decided]
- Calendars other than the primary calendar. [Decided]
- Per-task session length for big tasks. [Assumed]
- Time zones other than the device's. [Decided]

## Changes from the original spec

These are the places where the owner's answers changed or filled in the original text.

| Topic | Original spec | Now | Status |
|---|---|---|---|
| Task type and condition | Kinds Big, Work day, Short fixed item. Work and study tasks placed by work or home | Type (renamed from Kind) keeps the three types. Condition is new and holds only Place: Any, Work, or Home. Work day tasks always have Place = Work | [Decided] |
| Work day | "Any time on a work day"; conditions section limits work tasks to work hours | No time slot. Assigned to a day and summed by duration; about 2 hours left open per day if needed. Lunch does not apply to them | [Decided] |
| Lunch | Not stated | 12:00 to 13:30 is not available work time | [Decided] |
| Big-task spread | "Spread over the time before the deadline" | Spread window = now to the earlier of deadline and now + spread days. No 14-day default when there is no deadline | [Decided] |
| Session length | Not stated | 60 minutes by default; sessions get longer on average if the task doesn't fit | [Decided] |
| Calendar delete | Deleted event marks the task unscheduled | Unscheduled tasks are held out of automatic placement until I reschedule them | [Decided] |
| Topics | Optional, grouped | Optional free text, label only, no grouping | [Decided] |
| Tier intervals | "for example tier 1 every 7 days" | 7, 14, 30 days | [Decided] |
| Contacted action | Resets timer when marking someone contacted | Shown for every person | [Assumed] |
| Zoom-out color | "Combine the blocks below into one color" | Average of the level below | [Decided] |
| Zoom gesture | Not stated | Pinch to zoom in and out | [Decided] |
| Week labels | Not stated | Week number; a year can have 53 weeks | [Decided] |
| Time zone | Not stated | Device local time | [Decided] |
