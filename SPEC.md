# life-life-life: product spec

Personal iPhone PWA (single user) for the things I forget. This spec says what the app should do. The code is being rewritten from this spec. Setup, stack, and status are in the project's setup notes.

## How to read this spec

Every behavior is tagged with where it came from:

- **[Decided]**: I confirmed it, in the original spec or in questions in other branches.
- **[Assumed]**: someone (an agent or the spec writer) chose it. The default is in use until I answer the linked question, if there is one. Build it this way unless I say otherwise.
- **[Open Qn]**: I have not answered. The question and the spec writer's recommendation are at the end, under "Open questions".

Where this spec differs from the original spec, the change is listed under "Changes from the original spec" at the end.

## Principles

- Scheduling is automatic, but nothing happens silently. Every placement is announced, and I can move or undo it. [Decided]
- Edits I make in Google Calendar win over the app for times. The app only changes events it created itself. [Decided]
- A failed save or a failed read is shown to me. It is never swallowed, and the screen shows what is actually stored, not what I tried to save. [Assumed]
- All times are the device's local time. [Decided] (Q17)

## 1. Google Calendar

- Read events from my primary calendar. A refresh re-reads Google, so edits I make there appear in the app. [Decided]
- Read busy times to find open slots for the scheduler. [Decided]
- Create calendar events for scheduled tasks. Each app-created event links back to its task. [Decided]
  - One event per session, titled with the task's title. [Assumed]
- Sync on each refresh: [Decided]
  - If an app-created event was moved, the task's scheduled time moves to match.
  - If an app-created event was deleted, the task becomes unscheduled.
  - Other edits to events are ignored.
- After I delete an app-created event, its task stays unscheduled and is held out of automatic placement until I reschedule it. [Decided] (Q6)
- Unscheduling or deleting a task updates Google Calendar: its calendar events are removed. [Decided] (Q5)
- Sign-in requests calendar access. [Decided]
- If Google access can no longer be refreshed, the app shows a "Reconnect Google" prompt. It does not fail silently. [Decided] (Q19)

## 2. Tasks and scheduling

### 2.1 Task fields

- **Title**, required. [Assumed]
- **Type**, required. Three types: [Decided] (the field was called "Kind"; renamed to "Type")
  - *Big*: a task that takes several sessions, spread over time.
  - *Work day*: a task done on a work day (Sunday to Thursday). It has no time slot; see 2.4.
  - *Short fixed item*: a short task of a fixed length, like shopping.
- **Duration** in minutes, required. For a big task, this is the total time across all its sessions. [Assumed]
- **Topic**, optional free text. Blank means no topic. Shown on the task. [Decided]
- **Deadline**, optional. The latest time the task may be done. [Assumed]
- **Spread over (days)**, required for a big task. [Decided] Not used for other types. [Assumed]
- **Condition**, optional. A condition limits where a task can go. For now the only condition is **Place**: Any (default), Work, or Home. [Decided] (Q1: place is split out as a "Condition" type that holds only Place for now)

### 2.2 Big tasks: sessions and the spread window

- [Decided] The spread window runs from now until the earlier of the deadline and now plus "Spread over (days)". A deadline earlier than the spread window wins.
- [Assumed] The sessions are spaced evenly across the spread window.
- [Decided] Sessions are 60 minutes by default. If the task does not fit that way, each session is made longer, on average, so the task fits. (Q3)
- [Assumed] No two sessions of the same big task fall on the same day.
- [Assumed] If the task still cannot fit, none of its sessions are placed, and the task shows as unplaced.
- [Assumed] If the spread window has fewer days than sessions, the sessions are made longer, so there are fewer sessions (Q3).

### 2.3 Order and when placement runs

- Tasks are placed earliest deadline first. Tasks with no deadline are placed after those with one. [Assumed]
- Placement runs on every refresh and after any task change, for tasks that are not placed and are not held out (see 2.5). [Decided] (Q4)

### 2.4 Work and home

- Work hours: Sunday to Thursday, 09:00 to 19:00 local time. [Decided]
- Work hours are editable. [Decided] (Q16) Where I edit them is [Assumed]: in the app's settings.
- Friday and Saturday are days off. [Decided]
- Any time outside work hours counts as home. [Decided]
- **Work day** tasks have no time slot. The scheduler assigns each one to a work day, and their durations add up within that day, so a day can hold several tasks and still have time left. [Decided]
  - Each day leaves about 2 hours of work time open, if needed. [Decided]
  - Whether the lunch window (12:00 to 13:30) is still blocked is [Open Q20].
  - Whether a Work day task can have a Condition (Place) is [Open Q21].
- The **Place** condition limits where a task goes. [Assumed]
  - Work: every minute of the placement falls in work hours.
  - Home: every minute falls outside work hours.
  - Any: no limit.
  - When a place is set, a placement never straddles the boundary.
- A session with Place = Any may cross the work/home boundary. It is shown as one session, not split. [Assumed]

### 2.5 Announcements, changes, and holds

- [Decided] Every new placement is announced to me. Delivery is covered by the reminders feature, section 5.
- [Decided] I can move or undo any placement.
- [Decided] Undo returns the task to unscheduled. The task is then held out of automatic placement until I reschedule it. The same hold applies after I delete its calendar event (section 1). (Q6, Q8)
- [Decided] I move a session by tapping it and choosing a new time. Undo unschedules it. A "Schedule" action on the task releases the hold. (Q8)
- [Decided] Each task has an "Unschedule" button and a "Delete task" button. Both update Google Calendar accordingly. (Q5)

### 2.6 Unplaced and unscheduled tasks

- [Assumed] A task that cannot be placed is unplaced. It stays on the Tasks screen, marked as unplaced.
- [Assumed] A task I unscheduled (by undo or by deleting its event) is unscheduled, not unplaced. It stays on the Tasks screen, marked as unscheduled, until I reschedule it.

### 2.7 Tasks screen

- Lists all tasks, earliest deadline first, then tasks with no deadline. [Assumed]
- Each row shows title, topic (if any), type, spread (for big tasks), deadline (if any), and status: placed, unplaced, or unscheduled (held). [Assumed]
- I can add and delete tasks. [Assumed]
- Deleting asks for confirmation. [Assumed]
- Topics are a label in v1. Grouping tasks under topics is not built. [Decided] (Q9)
- Editing a task after creation: title, duration, and deadline. [Decided] (Q7)

## 3. People and reach-outs

### 3.1 Person fields

- **Name**, required. [Assumed]
- **Tier**, 1 to 3, required. New people default to tier 2. [Assumed]
- **Interval override** in days, optional. Must be a whole number, 1 or more. [Assumed] A blank field means use the tier default.
- **Last contacted**, optional. [Assumed]

### 3.2 Due rule

- Tier default intervals: tier 1 every 7 days, tier 2 every 14 days, tier 3 every 30 days. [Decided] (Q14)
- A person's override, when set, wins over the tier default. [Decided]
- A person who has never been contacted counts from the day they were added. [Decided] (Q18)
- A person is due when the time since their last contact (or since they were added) reaches their interval. [Assumed]
- When a person becomes due, I get a push notification to contact them, at 19:00 on the due day. [Decided] (Q15; section 5)

### 3.3 Lists

- **Due now**: every due person, tier 1 first, then most overdue first. [Decided]
- **Everyone**: all people, due or not, with their tier and interval. [Assumed]
- The due list is recalculated each time the app opens or comes back to the foreground. It does not need a manual reload. [Assumed]

### 3.4 Actions

- [Decided] **Contacted** resets the person's timer to now.
- [Assumed] **Contacted** is available for every person, in both lists, not only due ones.
- **Remove** deletes the person. It asks for confirmation first. [Assumed]
- Editing a person after creation: name, tier, and interval. [Decided] (Q7)

## 4. Mood colors

### 4.1 Setting a day

- One color per day. Tap a day to choose a color, or clear it. [Assumed] Days can be left blank. [Decided] Blank days are never counted as a color. [Assumed]
- The palette is six pastel colors: coral, orange, yellow, green, blue, purple. [Decided] (Q13)
- The day picker shows the date in a readable form, for example "Friday, October 9". [Assumed]
- A color is shown as saved only after it is stored. If the save fails, the day shows its previous stored state and the error stays visible until my next successful save. [Assumed]
- Hourly logging is out of scope for v1. [Decided]

### 4.2 Zoom levels

- Four levels, from finest to coarsest: day, week, month, year. [Decided]
- **Day**: every day of the month being viewed. [Assumed]
- **Week**: Sunday-start weeks that touch the month being viewed. [Assumed]
  - A week's label is its week number, counted by the week's Thursday. Week 1 is the first week whose Thursday falls in January. [Assumed]
  - A year that ends with a 53rd week shows week 53. [Decided] (Q10)
- **Month**: the 12 months of the year being viewed. [Assumed]
- **Year**: 10 years ending with the year being viewed. [Assumed]
- Zoom with a pinch gesture inside the app: pinch out on a block to zoom in one level, pinch in to zoom out. [Decided] Drilling down stays inside the month being viewed: zooming into a week in October shows October's days only, so the days of September that fall in that week are not shown. [Assumed]
- Previous and next move by one month at the day and week levels, one year at the month level, and ten years at the year level. [Assumed]

### 4.3 Colors of coarser blocks

- [Decided] Zoomed-out blocks combine the blocks below them into one color, per the original spec.
- [Decided] The combined color is the average of the colors of the blocks directly below. Each level averages the level below. (Q11)
- [Assumed] Blocks with no colored children have no color.
- [Decided] A week that touches two months counts toward both months. (Q12)
- [Decided] Colors are averaged channel by channel in RGB for now. A perceptual color space may come later. (Q13)
- Each day's color is saved once per day and survives reloads. [Decided]

## 5. Reminders

- [Decided] Reminders arrive as phone notifications, even when the app is closed.
- [Decided] Notifications work only after the app is added to the Home Screen (iOS 16.4 or newer). The app explains this when notifications are turned on.
- [Assumed] Each device that turns on notifications is registered separately.
- Reminders cover:
  - [Decided] A task session, 10 minutes before it starts. (Q15)
  - [Decided] New placements are announced. [Assumed] They are batched as one message per scheduler run.
  - [Decided] A person who becomes due, at 19:00 on the due day. (Q15)

## 6. Today view

- [Decided] Shows today's placed sessions, the people who are due, and today's mood color.
- [Assumed] Each session shows its time, task title, and topic, in time order.
- [Assumed] Unplaced and unscheduled tasks are not shown on Today. They are on the Tasks screen.
- [Decided] Sign-in and sign-out already exist. Keep them working.

## Out of scope for v1

- Location tracking or background location. "At work" comes from the schedule. [Decided]
- Two-way sync of events the app did not create. [Decided]
- Hourly mood logging. [Decided]
- Learning from my habits to improve scheduling. [Decided]
- A native iOS app. [Decided]
- Calendars other than the primary calendar. [Decided]
- Per-task session length for big tasks. [Assumed]
- Time zones other than the device's. [Decided] (Q17)

## Changes from the original spec

These are the places where the owner's answers changed or filled in the original text.

| Topic | Original spec | Now | Status |
|---|---|---|---|
| Task type and condition | Kinds Big, Work day, Short fixed item. Work and study tasks placed by work or home | Type (renamed from Kind) keeps the three types. Condition is new and holds only Place: Any, Work, or Home | [Decided] Q1 |
| Work day | "Any time on a work day"; conditions section limits work tasks to work hours | No time slot. Assigned to a day and summed by duration; about 2 hours left open per day if needed. Lunch and Condition are open | [Decided]; Q20, Q21 open |
| Big-task spread | "Spread over the time before the deadline" | Spread window = now to the earlier of deadline and now + spread days. No 14-day default when there is no deadline | [Decided] |
| Session length | Not stated | 60 minutes by default; sessions get longer on average if the task doesn't fit | [Decided] Q3 |
| Calendar delete | Deleted event marks the task unscheduled | Unscheduled tasks are held out of automatic placement until I reschedule them | [Decided] Q6 |
| Topics | Optional, grouped | Optional free text, label only, no grouping | [Decided] Q9 |
| Tier intervals | "for example tier 1 every 7 days" | 7, 14, 30 days | [Decided] Q14 |
| Contacted action | Resets timer when marking someone contacted | Shown for every person | [Assumed] |
| Zoom-out color | "Combine the blocks below into one color" | Average of the level below | [Decided] Q11 |
| Zoom gesture | Not stated | Pinch to zoom in and out | [Decided] |
| Week labels | Not stated | Week number; a year can have 53 weeks | [Decided] Q10 |
| Time zone | Not stated | Device local time | [Decided] Q17 |

## Open questions

Resolved questions are kept for the record. Each open question has the spec writer's recommendation, not the owner's. Reply with the number and what you want.

- **Q1. Place vs. kind. Resolved by the owner:** place is a "Condition" that holds only Place for now; "Kind" is renamed "Type".
- **Q2. Work-day hours. Resolved by the owner:** Work day tasks have no time slot and are assigned to a day. See Q20 for the lunch window.
- **Q3. Big task that doesn't fully fit. Resolved by the owner:** sessions are 60 minutes by default and get longer on average to fit.
- **Q4. When placement runs. Resolved by the owner:** on every refresh and after any task change, for tasks that are not placed and not held out.
- **Q5. Deleting a task with sessions on the calendar. Resolved by the owner:** "Unschedule" and "Delete task" buttons, and the app updates Google Calendar.
- **Q6. After I delete a calendar event, or undo a placement. Resolved by the owner:** the task stays unscheduled and is held out of automatic placement until I reschedule it.
- **Q7. Editing after creation. Resolved by the owner:** people's name, tier, and interval; tasks' title, duration, and deadline.
- **Q8. Moving or undoing a placement, and rescheduling a held task. Resolved by the owner:** tap a session to move it to a time I pick; undo unschedules it; a "Schedule" action on the task releases the hold.
- **Q9. Topic grouping. Resolved by the owner:** label only for now.
- **Q10. Week 53. Resolved by the owner:** show week 53 when it exists.
- **Q11. Averaging. Resolved by the owner:** average of the level below.
- **Q12. Straddling weeks. Resolved by the owner:** keep it; a week counts toward both months.
- **Q13. Mood palette and blending. Resolved by the owner:** pastel colors; RGB average for now, perceptual space later.
- **Q14. Tier intervals. Resolved by the owner:** keep 7, 14, and 30 days.
- **Q15. Reminder timing. Resolved by the owner:** due-person reminders at 19:00 on the due day; session reminder 10 minutes before.
- **Q16. Work hours editable. Resolved by the owner:** editable.
- **Q17. Time zone. Resolved by the owner:** device local time is enough.
- **Q18. Never-contacted people. Resolved by the owner:** they become due one interval after I add them.
- **Q19. Google reconnect. Resolved by the owner:** show a "Reconnect Google" prompt.
- **Q20. Lunch window for Work day tasks.** Now that Work day tasks have no time slot, does 12:00 to 13:30 still stay free of scheduled work? Recommend: yes, treat lunch as part of the 2 hours left open each day.
- **Q21. Condition on Work day tasks.** Can a Work day task have Place = Work or Home, given that it has no time slot? Recommend: no for now; Work day tasks are placed by day only, and Place applies to timed tasks.
