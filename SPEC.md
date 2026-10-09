# life-life-life: product spec

Personal iPhone app (single user) for the things I forget. This spec says what the app should do. It does not say how to build it; the code is being rewritten from here. Setup, stack, and status are in `CLAUDE.md`.

## How to read this spec

Every behavior is tagged with where it came from:

- **[Decided]**: I confirmed it, in the original spec or in a review answer.
- **[Assumed]**: someone (an agent or the spec writer) chose it. Build it this way unless I say otherwise.
- **[Open Qn]**: I have not answered. The question and a recommendation are at the end, under "Open questions".

Where the earlier build (open PRs #1 to #4) differed from the original spec, the change is listed under "Changes from the original spec" at the end.

## Principles

- Scheduling is automatic, but nothing happens silently. Every placement is announced, and I can move or undo it. [Decided]
- Edits I make in Google Calendar win over the app for times. The app only changes events it created itself. [Decided]
- A failed save or a failed read is shown to me. It is never swallowed, and the screen shows what is actually stored, not what I tried to save. [Assumed]
- All times are the device's local time. [Assumed] (see Q17)

## 1. Google Calendar

- Read events from my primary calendar. A refresh re-reads Google, so edits I make there appear in the app. [Decided]
- Read busy times to find open slots for the scheduler. [Decided]
- Create one calendar event per scheduled session. Each app-created event can be traced back to its task. [Decided] The event's title is the task's title. [Assumed]
- Sync on each refresh: [Decided]
  - If an app-created event was moved, the task's scheduled time moves to match.
  - If an app-created event was deleted, the task becomes unscheduled.
  - Other edits to events are ignored.
- Deleting a task removes its unstarted sessions from the calendar. [Assumed] (see Q5)
- After a deleted event makes a task unscheduled, the scheduler places it again on the next run. [Assumed] (see Q6)
- Sign-in asks for calendar access. If Google access can no longer be refreshed, the app shows a "Reconnect Google" prompt. It does not fail silently. [Assumed] (see Q19)
- Only my primary calendar is used. [Decided]

## 2. Tasks and scheduling

### 2.1 Task fields

- **Title**, required. [Decided]
- **Kind**, required. Three kinds: [Decided]
  - *Big*: a task that takes several sessions, spread over time.
  - *Work day*: any time on a work day (Sunday to Thursday).
  - *Short fixed item*: a short task of a fixed length, like shopping.
- **Duration** in minutes, required. For a big task, this is the total time across all its sessions. [Assumed]
- **Topic**, optional free text. Blank means no topic. Shown on the task. [Decided]
- **Deadline**, optional. The latest time the task may be done. [Decided]
- **Spread over (days)**, required for a big task, not used for other kinds. [Decided]
- **Place**, optional: Any (default), Work, or Home. This is the one scheduling condition in v1. [Assumed] (see Q1)

### 2.2 Big tasks: sessions and the spread window

- A big task is split into sessions of 60 minutes. A shorter last session takes the remainder. [Assumed] (fixed length; per-task length is not in v1)
- The sessions are spread evenly across the **spread window**: from now until the earlier of the deadline and now plus "Spread over (days)". A deadline earlier than the spread window wins. [Decided]
- No two sessions of the same big task fall on the same day. [Assumed]
- A big task is placed all or nothing. If all its sessions cannot fit, none are placed, and the task shows as unplaced. [Assumed] (see Q3)

### 2.3 Order

- Tasks are placed earliest deadline first. Tasks with no deadline are placed after those with one. [Assumed]

### 2.4 Work and home

- Work hours: Sunday to Thursday, 09:00 to 19:00 local time. [Decided]
- Friday and Saturday are days off. [Decided]
- Any time outside work hours counts as home. [Decided]
- A **Work day** task can be placed at any hour on Sunday to Thursday. [Decided, from the original wording] (see Q2)
- The **Place** condition limits where a task goes:
  - Work: every minute of the placement falls in work hours.
  - Home: every minute falls outside work hours.
  - Any: no limit.
  - A placement never straddles the boundary when a place is set. [Assumed]
- The original spec said "work tasks" and "study tasks". Those are now Place = Work and Place = Home. [Assumed] (see Q1)

### 2.5 Announcements and changes

- Every new placement is announced to me. (Delivered by the reminders feature, section 5.) [Decided]
- I can move any placement to a different time, or undo it. Undo returns the task to unscheduled. [Decided that I can; how I do it is [Open Q8]]

### 2.6 Unplaced tasks

- A task that cannot be placed stays on the Tasks screen, marked as unplaced. [Assumed]

### 2.7 Tasks screen

- Lists all tasks, earliest deadline first, then tasks with no deadline. [Assumed]
- Each row shows title, topic (if any), kind, spread (for big tasks), deadline (if any), and placed or unplaced status. [Assumed]
- I can add and delete tasks. [Decided]
- Deleting asks for confirmation. [Assumed]
- Topics are a label in v1. Grouping tasks under topics is not built. [Decided as a label; grouping is [Open Q9]]

## 3. People and reach-outs

### 3.1 Person fields

- **Name**, required. [Decided]
- **Tier**, 1 to 3, required. New people default to tier 2. [Assumed]
- **Interval override** in days, optional. Must be a whole number, 1 or more. [Assumed] A blank field means use the tier default.
- **Last contacted**, optional. [Decided]

### 3.2 Due rule

- Tier default intervals: tier 1 every 7 days, tier 2 every 14 days, tier 3 every 30 days. [Assumed; the original spec gave only "tier 1 every 7 days" as an example] (see Q14)
- A person's override, when set, wins over the tier default. [Decided]
- A person who has never been contacted counts from the day they were added. [Assumed] (see Q18)
- A person is due when the time since their last contact (or since they were added) reaches their interval.

### 3.3 Lists

- **Due now**: every due person, tier 1 first, then most overdue first. [Decided]
- **Everyone**: all people, due or not, with their tier and interval. [Assumed]
- The due list is recalculated each time the app opens or comes back to the foreground. It does not need a manual reload. [Assumed]

### 3.4 Actions

- **Contacted** resets the person's timer to now. [Decided]
- **Contacted** is available for every person, in both lists, not only due ones. [Decided: the original spec says marking someone contacted resets their timer]
- **Remove** deletes the person. It asks for confirmation first. [Assumed]
- Editing a person after creation (name, tier, interval). [Open Q7]

## 4. Mood colors

### 4.1 Setting a day

- One color per day. Tap a day to choose a color, or clear it. Blank is allowed and blank days are never counted as a color. [Decided for one color per day and blank allowed]
- The palette is six colors: coral, orange, yellow, green, blue, purple. [Assumed] (see Q13)
- The day picker shows the date in a readable form, for example "Friday, October 9". [Assumed]
- A color is shown as saved only after it is stored. If the save fails, the day shows its previous stored state and the error stays visible until my next successful save. [Assumed]
- Hourly logging is out of scope for v1. [Decided]

### 4.2 Zoom levels

- Four levels, from finest to coarsest: day, week, month, year. [Decided]
- **Day**: every day of the month being viewed.
- **Week**: Sunday-start weeks that touch the month being viewed. [Assumed]
  - A week's label is its week number in the year, counted by the week's Thursday. [Assumed] (see Q10)
- **Month**: the 12 months of the year being viewed. [Assumed]
- **Year**: 10 years ending with the year being viewed. [Assumed]
- Tapping a block zooms in one level. Drilling down stays inside the month being viewed: tapping a week in October shows October's days only, so the days of September that fall in that week are not shown. [Assumed]
- Previous and next move by one month at the day and week levels, one year at the month level, and ten years at the year level. [Assumed]

### 4.3 Colors of coarser blocks

- A coarser block's color is the average of the colors of the blocks directly below it. Each level averages the level below. [Decided wording from the original spec's "combine the level below"; averaging is [Assumed]] (see Q11)
- Blocks with no colored children have no color. [Assumed]
- A week that touches two months counts toward both months. [Assumed] (see Q12)
- Stored in the `moods` table, one row per user per day. [Decided]

## 5. Reminders

- Web Push through the service worker. Sends run from a scheduled server function. [Decided]
- Push works only after the app is added to the Home Screen (iOS 16.4 or newer). The app explains this when push is turned on. [Decided]
- Each device's push subscription is stored. [Decided]
- Reminders cover:
  - A task session that is about to start. [Decided] (timing is [Open Q15])
  - New placements, announced as one message per scheduler run. [Decided for announcing; batching is [Assumed]]
  - Due people. [Decided] (timing is [Open Q15])
- Not built yet. Depends on the server function and the schedule.

## 6. Today view

- Shows today's placed sessions in time order (time, task title, topic), the people who are due, and today's mood color. [Decided for contents; order is [Assumed]]
- Unplaced tasks are not shown on Today. They are on the Tasks screen. [Assumed]
- Sign-in and sign-out already work. Keep them working. [Decided]

## Out of scope for v1

- Location tracking or background location. "At work" comes from the schedule. [Decided]
- Two-way sync of events the app did not create. [Decided]
- Hourly mood logging. [Decided]
- Learning from my habits to improve scheduling. [Decided]
- A native iOS app. [Decided]
- Calendars other than the primary calendar. [Decided]
- Per-task session length for big tasks. [Assumed]
- Time zones other than the device's. [Assumed] (see Q17)

## Changes from the original spec

These are the places where the open PRs or their reviews changed or filled in the original text. Each one is either decided by me or open.

| Topic | Original spec | Now | Source | Status |
|---|---|---|---|---|
| Task kinds and place | "Work tasks" and "study tasks" placed by work or home | Kinds are Big, Work day, Short fixed item. Place is a separate condition: Any, Work, or Home | Tasks PR | [Assumed] Q1 |
| Work day | "Any time on a work day" | Any hour Sunday to Thursday. The scheduler PR limited it to work hours | Tasks PR vs. scheduler PR | [Decided by original wording] Q2 |
| Big-task spread | "Spread over the time before the deadline" | Spread window = now to the earlier of deadline and now + spread days | Tasks PR, owner answer | [Decided] |
| Topics | Optional, grouped | Optional free text, no grouping | Tasks PR, owner answer | [Decided] label; grouping Q9 |
| Partial big tasks | Not stated | All or nothing | Tasks PR vs. scheduler PR | [Assumed] Q3 |
| Tier intervals | "for example tier 1 every 7 days" | 7, 14, 30 days | People PR | [Assumed] Q14 |
| Contacted action | Resets timer for any person | Shown for every person | People PR review | [Decided] |
| Zoom-out color | "Combine the blocks below into one color" | Average of the level below | Mood PR | [Assumed] Q11 |
| Week labels | Not stated | Week number; a year can have 53 weeks | Mood PR | Q10 |
| Time zone | Not stated | Device local time | Scheduler PR skipped it | [Assumed] Q17 |

## Open questions

Each has my recommendation. Reply with the number and what you want.

- **Q1. Place vs. kind.** The original spec mixes "work tasks" with kinds. I recommend Place (Any, Work, Home) on any task, and Kind for shape only. Confirm?
- **Q2. Work-day hours.** Should a Work day task go at any hour Sunday to Thursday (original wording), or only during work hours (the scheduler PR)? Recommend: any hour, with Place = Work to restrict it.
- **Q3. Big task that doesn't fully fit.** All-or-nothing (the tasks PR) or place as many sessions as fit (the scheduler PR)? Recommend: all or nothing, with the task shown as unplaced.
- **Q4. When the scheduler runs.** Recommend: on every refresh and after any task change. Alternative: only on a button.
- **Q5. Deleting a task with sessions on the calendar.** Recommend: remove its future sessions from Google and tell me.
- **Q6. After a deleted calendar event.** Recommend: re-place the task automatically and announce it, rather than waiting for me.
- **Q7. Editing after creation.** Recommend: allow editing a person's name, tier, and interval, and a task's title, duration, and deadline. Both are small.
- **Q8. Moving or undoing a placement.** How do I do it? Recommend: tap a session to move it to a time I pick, or unschedule it. Undo returns the task to the scheduler.
- **Q9. Topic grouping.** Is a grouped view needed in v1? Recommend: no, label only.
- **Q10. Week 53.** Some years end with a partial week that counts as week 53. The mood PR's spec text said the last week is 52, but the code shows 53 for 2026. Recommend: show 53 when it exists, so labels stay unique.
- **Q11. Averaging.** Average of the level below (current), or average of every raw day in the block? Recommend: average of the level below, since it matches "combine the level below."
- **Q12. Straddling weeks.** A week that touches two months counts toward both, including its days from the other month. Recommend: keep it.
- **Q13. Mood palette.** Six colors: coral, orange, yellow, green, blue, purple. Keep, or change?
- **Q14. Tier intervals.** 7, 14, and 30 days. Keep, or change?
- **Q15. Reminder timing.** When do due-person reminders fire, and how far ahead of a session should it remind me? Recommend: due reminders at 09:00 on the due day; session reminder 10 minutes before.
- **Q16. Work hours editable?** Recommend: fixed in v1.
- **Q17. Time zone.** Device local time is enough? Recommend: yes.
- **Q18. Never-contacted people.** They become due one interval after I add them. Recommend: keep it.
- **Q19. Google reconnect.** When the Google connection lapses, show a "Reconnect Google" prompt? Recommend: yes.
