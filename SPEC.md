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

- [Decided] The app is one page with four tabs: Today, Tasks, People, Mood. Each tab has its own URL: #/today, #/tasks, #/people, #/mood. Opening a tab adds a history entry, so back, forward, and reload keep the open tab. An empty or unknown hash opens Today. Sign-in and sign-out stay at the top of the page.
- [Decided] The top bar has a Refresh button on every page. It re-reads Google, runs placement, and then reloads the stored data on every page.

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

- Lists all tasks, earliest deadline first, then tasks with no deadline. [Assumed]
- Each row shows title, topic (if any), type, spread (for big tasks), deadline (if any), and status: placed, unplaced, or unscheduled (held). [Assumed]
- I can add and delete tasks. [Assumed]
- Deleting asks for confirmation. [Assumed]
- Topics are a label only. Grouping tasks under topics is not built. [Decided]
- Editing a task after creation: title, duration, and deadline. [Decided]
- Type and spread days are set at creation and cannot be changed afterward. [Decided]

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

- **Due now**: every due person, tier 1 first, then most overdue first. [Decided]
- **Everyone**: all people, due or not, with their tier and interval. [Assumed]
- The due list is recalculated each time the app opens or comes back to the foreground. It does not need a manual reload. [Assumed]

### 3.4 Actions

- [Decided] **Contacted** resets the person's timer to now.
- [Assumed] **Contacted** is available for every person, in both lists, not only due ones.
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
