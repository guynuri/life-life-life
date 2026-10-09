# life-life-life: product spec

Personal iPhone app (single user) for the things I forget. This spec says what the app should do. The code is being rewritten from this spec. Setup, stack, and status are in the project's setup notes.

## How to read this spec

Every behavior is tagged with where it came from:

- **[Decided]**: I confirmed it, in the original spec or in my PR #2 answers.
- **[Assumed]**: someone (an agent or the spec writer) chose it. The default is in use until I answer the linked question, if there is one. Build it this way unless I say otherwise.
- **[Open Qn]**: I have not answered. The question and the spec writer's recommendation are at the end, under "Open questions".

Where the earlier build (open PRs #1 to #4) differed from the original spec, the change is listed under "Changes from the original spec" at the end.

## Principles

- Scheduling is automatic, but nothing happens silently. Every placement is announced, and I can move or undo it. [Decided]
- Edits I make in Google Calendar win over the app for times. The app only changes events it created itself. [Decided]
- A failed save or a failed read is shown to me. It is never swallowed, and the screen shows what is actually stored, not what I tried to save. [Assumed]
- All times are the device's local time. [Assumed] (see Q17)

## 1. Google Calendar

- Read events from my primary calendar. A refresh re-reads Google, so edits I make there appear in the app. [Decided]
- Read busy times to find open slots for the scheduler. [Decided]
- Create calendar events for scheduled tasks. Each app-created event links back to its task. [Decided]
  - One event per session, titled with the task's title. [Assumed]
- Sync on each refresh: [Decided]
  - If an app-created event was moved, the task's scheduled time moves to match.
  - If an app-created event was deleted, the task becomes unscheduled.
  - Other edits to events are ignored.
- After I delete an app-created event, its task stays unscheduled and is held out of automatic placement until I reschedule it. [Assumed] (see Q6)
- Deleting a task removes its unstarted sessions from the calendar and tells me. [Assumed] (see Q5)
- Sign-in requests calendar access. [Decided]
- If Google access can no longer be refreshed, the app shows a "Reconnect Google" prompt. It does not fail silently. [Assumed] (see Q19)

## 2. Tasks and scheduling

### 2.1 Task fields

- **Title**, required. [Assumed]
- **Kind**, required. Three kinds: [Decided]
  - *Big*: a task that takes several sessions, spread over time.
  - *Work day*: any time in the work week (Sunday to Thursday), except lunch (12:00 to 13:30). [Decided]
  - *Short fixed item*: a short task of a fixed length, like shopping.
- **Duration** in minutes, required. For a big task, this is the total time across all its sessions. [Assumed]
- **Topic**, optional free text. Blank means no topic. Shown on the task. [Decided]
- **Deadline**, optional. The latest time the task may be done. [Assumed]
- **Spread over (days)**, required for a big task. [Decided] Not used for other kinds. [Assumed]
- **Place**, optional: Any (default), Work, or Home. This is the one scheduling condition in v1. [Assumed] (see Q1)

### 2.2 Big tasks: sessions and the spread window

- [Decided] The spread window runs from now until the earlier of the deadline and now plus "Spread over (days)". A deadline earlier than the spread window wins.
- [Assumed] The sessions are spaced evenly across the spread window.
- A big task is split into sessions of 60 minutes. A shorter last session takes the remainder. [Assumed] (fixed length; per-task length is not in v1)
- No two sessions of the same big task fall on the same day. [Assumed] If the spread window has fewer days than sessions, the task is unplaced. [Assumed] (see Q3)
- A big task is placed all or nothing. If all its sessions cannot fit, none are placed, and the task shows as unplaced. [Assumed] (see Q3)

### 2.3 Order and when placement runs

- Tasks are placed earliest deadline first. Tasks with no deadline are placed after those with one. [Assumed]
- Placement runs on every refresh and after any task change, for tasks that are not placed and are not held out (see 2.5). [Assumed] (see Q4)

### 2.4 Work and home

- Work hours: Sunday to Thursday, 09:00 to 19:00 local time. [Decided]
- Work hours are fixed in v1. [Assumed] (see Q16)
- Friday and Saturday are days off. [Decided]
- Any time outside work hours counts as home. [Decided]
- A **Work day** task can be placed at any hour from Sunday to Thursday, except 12:00 to 13:30 (lunch). It is not limited to work hours. [Decided]
- The **Place** condition limits where a task goes. [Assumed]
  - Work: every minute of the placement falls in work hours.
  - Home: every minute falls outside work hours.
  - Any: no limit.
  - When a place is set, a placement never straddles the boundary.
- A session with Place = Any may cross the work/home boundary. It is shown as one session, not split. [Assumed]

### 2.5 Announcements, changes, and holds

- [Decided] Every new placement is announced to me. Delivery is covered by the reminders feature, section 5.
- [Decided] I can move or undo any placement.
- [Assumed] Undo returns the task to unscheduled. The task is then held out of automatic placement until I reschedule it. The same hold applies after I delete its calendar event (section 1). How I move or undo a session, and how I reschedule a held task, is [Open Q8].

### 2.6 Unplaced and unscheduled tasks

- [Assumed] A task that cannot be placed is unplaced. It stays on the Tasks screen, marked as unplaced.
- [Assumed] A task I unscheduled (by undo or by deleting its event) is unscheduled, not unplaced. It stays on the Tasks screen, marked as unscheduled, until I reschedule it.

### 2.7 Tasks screen

- Lists all tasks, earliest deadline first, then tasks with no deadline. [Assumed]
- Each row shows title, topic (if any), kind, spread (for big tasks), deadline (if any), and status: placed, unplaced, or unscheduled (held). [Assumed]
- I can add and delete tasks. [Assumed]
- Deleting asks for confirmation. [Assumed]
- Topics are a label in v1. Grouping tasks under topics is not built. [Assumed] (see Q9)
- Editing a task after creation (title, duration, deadline). [Open Q7]

## 3. People and reach-outs

### 3.1 Person fields

- **Name**, required. [Assumed]
- **Tier**, 1 to 3, required. New people default to tier 2. [Assumed]
- **Interval override** in days, optional. Must be a whole number, 1 or more. [Assumed] A blank field means use the tier default.
- **Last contacted**, optional. [Assumed]

### 3.2 Due rule

- Tier default intervals: tier 1 every 7 days, tier 2 every 14 days, tier 3 every 30 days. [Assumed] (the original gave only tier 1 = 7 days as an example; see Q14)
- A person's override, when set, wins over the tier default. [Decided]
- A person who has never been contacted counts from the day they were added. [Assumed] (see Q18)
- A person is due when the time since their last contact (or since they were added) reaches their interval. [Assumed]

### 3.3 Lists

- **Due now**: every due person, tier 1 first, then most overdue first. [Decided]
- **Everyone**: all people, due or not, with their tier and interval. [Assumed]
- The due list is recalculated each time the app opens or comes back to the foreground. It does not need a manual reload. [Assumed]

### 3.4 Actions

- [Decided] **Contacted** resets the person's timer to now.
- [Assumed] **Contacted** is available for every person, in both lists, not only due ones.
- **Remove** deletes the person. It asks for confirmation first. [Assumed]
- Editing a person after creation (name, tier, interval). [Open Q7]

## 4. Mood colors

### 4.1 Setting a day

- One color per day. Tap a day to choose a color, or clear it. [Assumed] Days can be left blank. [Decided] Blank days are never counted as a color. [Assumed]
- The palette is six colors: coral, orange, yellow, green, blue, purple. [Assumed] (see Q13)
- The day picker shows the date in a readable form, for example "Friday, October 9". [Assumed]
- A color is shown as saved only after it is stored. If the save fails, the day shows its previous stored state and the error stays visible until my next successful save. [Assumed]
- Hourly logging is out of scope for v1. [Decided]

### 4.2 Zoom levels

- Four levels, from finest to coarsest: day, week, month, year. [Decided]
- **Day**: every day of the month being viewed. [Assumed]
- **Week**: Sunday-start weeks that touch the month being viewed. [Assumed]
  - A week's label is its week number, counted by the week's Thursday. Week 1 is the first week whose Thursday falls in January. [Assumed] A year that ends with a 53rd week: [Open Q10].
- **Month**: the 12 months of the year being viewed. [Assumed]
- **Year**: 10 years ending with the year being viewed. [Assumed]
- Tapping a block zooms in one level. Drilling down stays inside the month being viewed: tapping a week in October shows October's days only, so the days of September that fall in that week are not shown. [Assumed]
- Previous and next move by one month at the day and week levels, one year at the month level, and ten years at the year level. [Assumed]

### 4.3 Colors of coarser blocks

- [Decided] Zoomed-out blocks combine the blocks below them into one color, per the original spec.
- [Assumed] The combined color is the average of the colors of the blocks directly below. Each level averages the level below. (see Q11)
- [Assumed] Blocks with no colored children have no color.
- [Assumed] A week that touches two months counts toward both months. (see Q12)
- [Assumed] Colors are averaged channel by channel in RGB. Blends of distant colors can look muddy, for example coral and blue become grey-brown. (see Q13)
- Each day's color is saved once per day and survives reloads. [Decided]

## 5. Reminders

- [Decided] Reminders arrive as phone notifications, even when the app is closed.
- [Decided] Notifications work only after the app is added to the Home Screen (iOS 16.4 or newer). The app explains this when notifications are turned on.
- [Assumed] Each device that turns on notifications is registered separately.
- Reminders cover:
  - [Decided] A task session that is about to start. Timing is [Open Q15].
  - [Decided] New placements are announced. [Assumed] They are batched as one message per scheduler run.
  - [Decided] Due people. Timing is [Open Q15].

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
- Time zones other than the device's. [Assumed] (see Q17)

## Changes from the original spec

These are the places where the open PRs or their reviews changed or filled in the original text. The "Source" column names the open PRs; delete it when they merge, since the names go stale.

| Topic | Original spec | Now | Source | Status |
|---|---|---|---|---|
| Task kinds and place | Kinds Big, Work day, Short fixed item. Work and study tasks placed by work or home | Kinds unchanged. Place is new: Any, Work, or Home, replacing the "work tasks" and "study tasks" wording | Tasks PR | [Assumed] Q1 |
| Work day | "Any time on a work day"; conditions section limits work tasks to work hours | Any time Sunday to Thursday, except 12:00 to 13:30 (lunch). The scheduler PR limited it to work hours | Owner answer | [Decided] Q2 resolved |
| Big-task spread | "Spread over the time before the deadline" | Spread window = now to the earlier of deadline and now + spread days. Drops the scheduler PR's 14-day default when there is no deadline | Tasks PR only; the scheduler PR must be changed to match when merged | [Decided] |
| Calendar delete | Deleted event marks the task unscheduled | Unscheduled tasks are held out of automatic placement until I reschedule them | Spec writer | [Assumed] Q6 |
| Topics | Optional, grouped | Optional free text, no grouping | Tasks PR; my PR #2 answers | [Decided] label; [Assumed] no grouping, Q9 |
| Partial big tasks | Not stated | All or nothing | Tasks PR and scheduler PR (both current heads) | [Assumed] Q3 |
| Tier intervals | "for example tier 1 every 7 days" | 7, 14, 30 days | People PR | [Assumed] Q14 |
| Contacted action | Resets timer when marking someone contacted | Shown for every person | People PR review | [Assumed] |
| Zoom-out color | "Combine the blocks below into one color" | Average of the level below | Mood PR | [Assumed] Q11 |
| Week labels | Not stated | Week number; a year can have 53 weeks | Mood PR | [Open Q10] |
| Time zone | Not stated | Device local time | Scheduler PR skipped it | [Assumed] Q17 |

## Open questions

Each has the spec writer's recommendation, not the owner's. Reply with the number and what you want.

- **Q1. Place vs. kind.** The original spec mixes "work tasks" with kinds. Recommend: Place (Any, Work, Home) on any task, and Kind for shape only. Confirm?
- **Q2. Work-day hours. Resolved by the owner:** a Work day task can go at any time Sunday to Thursday except 12:00 to 13:30 (lunch). Section 2.4 has the rule.
- **Q3. Big task that doesn't fully fit.** Both PRs currently place all sessions or none. Keep that, or place as many sessions as fit? Recommend: all or nothing, with the task shown as unplaced.
- **Q4. When placement runs.** Recommend: on every refresh and after any task change, for tasks that are not placed and not held out. Alternative: only on a button.
- **Q5. Deleting a task with sessions on the calendar.** Recommend: remove its unstarted sessions from Google and tell me.
- **Q6. After I delete a calendar event, or undo a placement.** Recommend: the task stays unscheduled and is held out of automatic placement until I reschedule it. This respects my delete. Alternative: re-place it on the next run and announce it.
- **Q7. Editing after creation.** Recommend: allow editing a person's name, tier, and interval, and a task's title, duration, and deadline.
- **Q8. Moving or undoing a placement, and rescheduling a held task.** How do I do it? Recommend: tap a session to move it to a time I pick; undo unschedules it; a "Schedule" action on the task releases the hold.
- **Q9. Topic grouping.** Is a grouped view needed in v1? Recommend: no, label only.
- **Q10. Week 53.** Some years end with a partial week, which can be week 53. Options: show 53 when it exists (recommended, so labels stay unique); fold it into 52; or keep 53 and also label January's first week with its year, since a week that ends in January can carry the previous year's number.
- **Q11. Averaging.** Average of the level below (current), or average of every raw day in the block? Recommend: average of the level below, since it matches "combine the level below."
- **Q12. Straddling weeks.** A week that touches two months counts toward both, including its days from the other month. Recommend: keep it.
- **Q13. Mood palette and blending.** Six colors: coral, orange, yellow, green, blue, purple. Keep, or change? And should colors average per RGB channel (current, can look muddy) or in a perceptual color space? Recommend: keep the six colors and the RGB average for v1.
- **Q14. Tier intervals.** 7, 14, and 30 days. Keep, or change? Recommend: keep 7, 14, and 30 days.
- **Q15. Reminder timing.** When do due-person reminders fire, and how far ahead of a session should it remind me? Recommend: due reminders at 09:00 on the due day; session reminder 10 minutes before.
- **Q16. Work hours editable?** Recommend: fixed in v1.
- **Q17. Time zone.** Device local time is enough? Recommend: yes.
- **Q18. Never-contacted people.** They become due one interval after I add them. Recommend: keep it.
- **Q19. Google reconnect.** When the Google connection lapses, show a "Reconnect Google" prompt? Recommend: yes.
