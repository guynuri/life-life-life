# Pre-timed events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let me add, edit, and delete fixed-time events (title, start, duration, category) from the app. Each category is a Google calendar. Fixed events show on Today and block time for placed tasks.

**Architecture:** Fixed events live only in Google Calendar, tagged with a private extended property. Pure rules (validation, body building, read-back, calendar filtering) sit in `web/src/lib/` with unit tests. Thin Google calls get a `calendarId` parameter. The Today tab loads fixed events from Google on each load and refresh.

**Tech Stack:** React, TypeScript, Vite, Vitest, Testing Library, Playwright, Google Calendar API v3 (`calendar.events` scope).

**Spec:** `docs/superpowers/specs/2026-10-31-pre-timed-events-design.md`. Also read `SPEC.md` sections 1, 2.4, 2.5, 6. This plan changes two `SPEC.md` lines (Task 8).

## Global Constraints

- TypeScript strict with `noUncheckedIndexedAccess`. `npm run build` in `web/` must pass before each commit.
- Pure logic has no DOM and no network. Tests are `*.test.ts`, run with `npm test`.
- All times are device local time. Google takes RFC 3339 without milliseconds (`rfc3339` in `calendarEvents.ts`).
- Duration is a whole number of minutes, 5 or more. Start must not be in the past at create time.
- A failed Google write is shown to the user and leaves no stored state changed. Google is called first.
- The app never changes an event it did not create. Fixed events carry `extendedProperties.private.lifeKind = "fixed"`. Session events keep their existing `taskId` and `sessionId` tags.
- No new database table in this plan, so no migration and no grants.

## Review Focus

1. A calendar that is read-only (holiday, shared) is offered as a category. Expected: not offered (Task 1).
2. A start time in the past. Expected: refused with a message, nothing created (Task 2).
3. Duration of 0, negative, or non-integer. Expected: refused (Task 2).
4. A Google failure during edit or move. Expected: error shown, form stays open, event unchanged (Task 4).
5. An event deleted or edited in Google Calendar between refreshes. Expected: Today shows Google's current state after refresh (Task 5).
6. A fixed event spanning midnight. Expected: shown on the day it starts, and still blocks time (Task 3).

Each line's test is in the task that owns it.

---

### Task 1: Calendar list and per-calendar access

**Files:**
- Modify: `web/src/lib/calendar.ts` (every function takes `calendarId` instead of hard-coding `primary`)
- Modify: `web/src/lib/calendarEvents.ts` (add `writableCalendars`)
- Test: `web/src/lib/calendarEvents.test.ts` (extend)

**Interfaces:**
- Produces:
  - `interface CalendarInfo { id: string; summary: string; writable: boolean }` in `calendarEvents.ts`
  - `writableCalendars(calendars: readonly CalendarInfo[]): CalendarInfo[]`, keeps `writable` ones, in input order
  - `listCalendars(token: string | null): Promise<CalendarInfo[]>` in `calendar.ts`, calls `GET https://www.googleapis.com/calendar/v3/users/me/calendarList`, maps `accessRole` to `writable` (`owner` or `writer`)
  - `listEvents(token, from, to, calendarId)`, `getEvent(token, calendarId, eventId)`, `createEvent(token, calendarId, body)`, `moveEvent(token, calendarId, eventId, span)`, `deleteEvent(token, calendarId, eventId)` in `calendar.ts`. Argument order: `calendarId` follows `token`.
  - `listAllEvents(token, from, to): Promise<GoogleEvent[]>` in `calendar.ts`, lists events across every calendar from `listCalendars`.

- [ ] **Step 1: Write the failing test**

```ts
it("keeps only writable calendars, in order", () => {
  const cals = [
    { id: "a", summary: "Work", writable: true },
    { id: "h", summary: "Holidays", writable: false },
    { id: "b", summary: "Haircut", writable: true },
  ];
  expect(writableCalendars(cals).map((c) => c.id)).toEqual(["a", "b"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/calendarEvents.test.ts`
Expected: FAIL, `writableCalendars` is not exported.

- [ ] **Step 3: Implement `writableCalendars` in `calendarEvents.ts`, and parameterize `calendar.ts`**

Replace the hard-coded `EVENTS_URL` with a builder `eventsUrl(calendarId)` that encodes the id. Add `listCalendars` and `listAllEvents` as specified above. `listAllEvents` calls `listCalendars`, then `listEvents` for each calendar id, and concatenates the results. Each returned event keeps its own calendar id: attach it as a field the caller can read, for example by returning `{ calendarId, event }[]`. Use that shape so Task 3 can tell which calendar a fixed event is on.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/calendarEvents.test.ts && npm run build`
Expected: PASS, build succeeds. Existing sync code calls the old signatures, so fix each call site in `calendarSync.ts` to pass `"primary"` for session events. Session events stay on primary.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/calendar.ts web/src/lib/calendarEvents.ts web/src/lib/calendarEvents.test.ts web/src/lib/calendarSync.ts
git commit -m "feat: per-calendar Google access and writable calendar list"
```

---

### Task 2: Fixed-event rules (validation and body)

**Files:**
- Create: `web/src/lib/fixedEvents.ts`
- Test: `web/src/lib/fixedEvents.test.ts`

**Interfaces:**
- Produces:
  - `interface FixedEventInput { title: string; start: number; durationMinutes: number; calendarId: string }`
  - `validateFixedEvent(input: FixedEventInput, now: number): string | null`. Returns the first problem as a message, or null. Refuses a blank title (trimmed), a non-integer or `< 5` duration, a missing calendar id, and a start `< now`.
  - `fixedEventBody(input: FixedEventInput): EventBody`. Summary is the trimmed title. Start is `rfc3339(start)`, end is `rfc3339(start + durationMinutes * 60000)`. Sets `reminders: { useDefault: true }` and `extendedProperties.private = { lifeKind: "fixed" }`.
- Consumes: `rfc3339`, `EventBody` from `calendarEvents.ts`. Extend `EventBody` in `calendarEvents.ts` to allow `reminders?: { useDefault: boolean }` and `extendedProperties.private: Record<string, string>`.

- [ ] **Step 1: Write the failing tests**

```ts
const now = Date.parse("2026-11-02T09:00:00");
const ok = { title: "Haircut", start: Date.parse("2026-11-03T10:00:00"), durationMinutes: 60, calendarId: "cal" };

it("accepts a valid input", () => expect(validateFixedEvent(ok, now)).toBeNull());
it("refuses a blank title", () => expect(validateFixedEvent({ ...ok, title: "   " }, now)).not.toBeNull());
it("refuses a duration under 5 minutes", () => expect(validateFixedEvent({ ...ok, durationMinutes: 4 }, now)).not.toBeNull());
it("refuses a fractional duration", () => expect(validateFixedEvent({ ...ok, durationMinutes: 30.5 }, now)).not.toBeNull());
it("refuses a start in the past", () => expect(validateFixedEvent({ ...ok, start: now - 1 }, now)).not.toBeNull());
it("builds a body with calendar defaults and the fixed tag", () => {
  const body = fixedEventBody(ok);
  expect(body.summary).toBe("Haircut");
  expect(body.reminders).toEqual({ useDefault: true });
  expect(body.extendedProperties.private).toEqual({ lifeKind: "fixed" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/fixedEvents.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `fixedEvents.ts` to the interfaces above**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx vitest run src/lib/fixedEvents.test.ts && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/fixedEvents.ts web/src/lib/fixedEvents.test.ts web/src/lib/calendarEvents.ts
git commit -m "feat: fixed-event validation and body rules"
```

---

### Task 3: Read-back and busy time across calendars

**Files:**
- Modify: `web/src/lib/fixedEvents.ts` (add read-back)
- Modify: `web/src/lib/calendarSync.ts` (`placeTasks` takes busy time from all calendars)
- Test: `web/src/lib/fixedEvents.test.ts` (extend)

**Interfaces:**
- Produces:
  - `interface FixedEvent { eventId: string; calendarId: string; title: string; start: number; end: number }`
  - `fixedEventsFrom(items: readonly { calendarId: string; event: GoogleEvent }[]): FixedEvent[]`. Keeps events with `extendedProperties.private.lifeKind === "fixed"`, not cancelled, with a timed span. Sorted by start. A span crossing midnight is kept as one item, shown on the day it starts.
- Consumes: `listAllEvents` from Task 1, `busySpans` from `calendarEvents.ts`.
- `placeTasks` change: `external = busySpans((await listAllEvents(token, now, horizon)).map((i) => i.event))`. Session events from other calendars are busy too, which matches the rule that the app only avoids its own sessions through the scheduler.

- [ ] **Step 1: Write the failing tests**

```ts
it("returns only fixed events, sorted by start", () => {
  const items = [
    { calendarId: "c", event: fixedEv("b", "2026-11-03T12:00:00", "2026-11-03T13:00:00") },
    { calendarId: "c", event: sessionEv("s", "2026-11-03T09:00:00", "2026-11-03T10:00:00") },
    { calendarId: "c", event: fixedEv("a", "2026-11-03T08:00:00", "2026-11-03T09:00:00") },
  ];
  expect(fixedEventsFrom(items).map((f) => f.eventId)).toEqual(["a", "b"]);
});

it("skips cancelled fixed events", () => {
  const items = [{ calendarId: "c", event: { ...fixedEv("x", "2026-11-03T08:00:00", "2026-11-03T09:00:00"), status: "cancelled" } }];
  expect(fixedEventsFrom(items)).toEqual([]);
});
```

`fixedEv` and `sessionEv` are test helpers in the test file that build a `GoogleEvent` with, respectively, `lifeKind: "fixed"` or no tag.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/fixedEvents.test.ts`
Expected: FAIL, `fixedEventsFrom` is not exported.

- [ ] **Step 3: Implement `fixedEventsFrom` and update `placeTasks`**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test && npm run build`
Expected: all unit tests pass, build succeeds. Also run `npx playwright test web/e2e/calendar.spec.ts` if it runs locally; it covers the sync path that `placeTasks` depends on.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/fixedEvents.ts web/src/lib/fixedEvents.test.ts web/src/lib/calendarSync.ts
git commit -m "feat: read fixed events back and block time across calendars"
```

---

### Task 4: Create, edit, and delete against Google

**Files:**
- Modify: `web/src/lib/fixedEvents.ts` (service functions)
- Test: `web/src/lib/fixedEvents.test.ts` (extend, for the pure parts of edit)

**Interfaces:**
- Produces, all taking `token: string | null` first, and calling Google before returning:
  - `createFixedEvent(token, input: FixedEventInput): Promise<string>` returns the new event id. Runs `validateFixedEvent` first and throws on a message.
  - `updateFixedEvent(token, current: { eventId: string; calendarId: string }, next: FixedEventInput): Promise<void>`. If `next.calendarId` differs, calls `moveEvent` between calendars (Google `events.move`), then patches. Patch uses start, end, and summary only.
  - `deleteFixedEvent(token, current: { eventId: string; calendarId: string }): Promise<void>`
- Consumes: `createEvent`, `moveEvent`, `deleteEvent`, and a new `patchEvent(token, calendarId, eventId, body)` in `calendar.ts`. Add `moveEventToCalendar(token, fromCalendarId, eventId, toCalendarId)` in `calendar.ts` using `POST .../events/{id}/move?destination=...`.

- [ ] **Step 1: Write the failing test**

Mock `fetch` in a test, or test the pure branch: `updateFixedEvent` with the same calendar must not call the move endpoint. Write this as a unit test with the `calendar` module mocked by Vitest:

```ts
vi.mock("./calendar", () => ({ createEvent: vi.fn(), patchEvent: vi.fn(), moveEventToCalendar: vi.fn(), deleteEvent: vi.fn() }));

it("patches without moving when the category is unchanged", async () => {
  await updateFixedEvent("t", { eventId: "e", calendarId: "c" }, { ...ok, calendarId: "c" });
  expect(moveEventToCalendar).not.toHaveBeenCalled();
  expect(patchEvent).toHaveBeenCalledWith("t", "c", "e", expect.any(Object));
});

it("refuses an invalid edit before calling Google", async () => {
  await expect(updateFixedEvent("t", { eventId: "e", calendarId: "c" }, { ...ok, durationMinutes: 1 })).rejects.toThrow();
  expect(patchEvent).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/fixedEvents.test.ts`
Expected: FAIL, functions are not defined.

- [ ] **Step 3: Implement the service functions and the `calendar.ts` additions**

On error, the function throws and the form shows the message. Do not catch and hide errors.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/fixedEvents.ts web/src/lib/fixedEvents.test.ts web/src/lib/calendar.ts
git commit -m "feat: create, edit, and delete fixed events in Google"
```

---

### Task 5: Form and Today list

**Files:**
- Create: `web/src/FixedEventSheet.tsx` (form, modeled on the existing `Sheet.tsx` and the task form pattern)
- Modify: `web/src/Today.tsx` (add a "Fixed events" part and an "Add event" button)
- Create: `web/e2e/fixed-events.e2e.ts` (Playwright flow)

**Interfaces:**
- `FixedEventSheet` props: `{ calendars: CalendarInfo[]; current: FixedEvent | null; googleToken: string | null; onSaved: () => void; onClose: () => void }`.
- Fields: title (text, required), start (`<input type="datetime-local">`, required), duration (number input, minutes, default 60), category (`<select>` over `writableCalendars`, default primary). Edit and Delete buttons appear when `current` is set. Delete asks for confirmation first.
- Today gets a new part: `loadFixedEvents()` calls `listAllEvents` for today's bounds, then `fixedEventsFrom`. Shown as its own section, with its own error line, following the existing `Part` pattern.

- [ ] **Step 1: Write the failing test**

Playwright flow in `web/e2e/fixed-events.e2e.ts`, using the existing `helpers.ts` sign-in approach. Stub the Google calls the same way the existing `calendar.spec.ts` does:

```ts
test("add a fixed event and see it on Today", async ({ page }) => {
  await page.goto("/#/today");
  await page.getByRole("button", { name: "Add event" }).click();
  await page.getByLabel("Title").fill("Haircut");
  await page.getByLabel("Start").fill(tomorrowAt("10:00"));
  await page.getByLabel("Duration (minutes)").fill("45");
  await page.getByLabel("Category").selectOption({ label: "Haircut" });
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Haircut")).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx playwright test e2e/fixed-events.e2e.ts`
Expected: FAIL, "Add event" button not found.

- [ ] **Step 3: Implement the sheet and Today section**

Edit flow: tap a fixed event on Today, change any field, Save. Category change moves the event. A save failure keeps the sheet open with the error.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx playwright test e2e/fixed-events.e2e.ts && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/FixedEventSheet.tsx web/src/Today.tsx web/e2e/fixed-events.e2e.ts
git commit -m "feat: fixed-event form and Today list"
```

---

### Task 6: Calendar list cache across refreshes

**Files:**
- Modify: `web/src/lib/fixedEvents.ts`

**Interfaces:**
- Produces `getCalendars(token): Promise<CalendarInfo[]>`. Caches the result in memory for the session. Refresh clears the cache. Plain memory only, no `localStorage`.

- [ ] **Step 1: Write the failing test**

```ts
it("lists calendars once per session until cleared", async () => {
  await getCalendars("t"); await getCalendars("t");
  expect(listCalendars).toHaveBeenCalledTimes(1);
  clearCalendarCache();
  await getCalendars("t");
  expect(listCalendars).toHaveBeenCalledTimes(2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx vitest run src/lib/fixedEvents.test.ts`
Expected: FAIL, `getCalendars` is not defined.

- [ ] **Step 3: Implement the cache and call `clearCalendarCache()` from the Refresh path in `App.tsx`**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npm test && npm run build`
Expected: PASS, build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/fixedEvents.ts web/src/lib/fixedEvents.test.ts web/src/App.tsx
git commit -m "feat: cache calendar list for the session"
```

---

### Task 7: Keep Google as the source of truth on refresh

**Files:**
- Test: `web/e2e/fixed-events.e2e.ts` (extend)

**Interfaces:** none new. This task proves behavior from Tasks 3 and 5.

- [ ] **Step 1: Write the failing test**

Add a Playwright flow: create a fixed event, then change the stub Google data to delete it, then press Refresh. Expect the event to be gone from Today.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx playwright test e2e/fixed-events.e2e.ts -g "refresh"`
Expected: FAIL if Today caches fixed events. If it passes, record that and keep the test.

- [ ] **Step 3: Fix only if the test fails**

The Today part reloads from Google on refresh (`reloadKey + refreshTick`), so no cache should hold old events. If it does, remove the cache for fixed events.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx playwright test e2e/fixed-events.e2e.ts && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/e2e/fixed-events.e2e.ts web/src/Today.tsx
git commit -m "test: fixed events follow Google on refresh"
```

---

### Task 8: Update SPEC.md

**Files:**
- Modify: `SPEC.md`

**Interfaces:** none.

- [ ] **Step 1: Make the edits**

- Section 1, "Read busy times" becomes: "Read busy times from every calendar I can write to, to find open slots for the scheduler." Mark it `[Decided]`.
- Section 1: add a bullet for fixed events. "I can add, edit, and delete fixed-time events from the app: title, start, duration, and category (a calendar). They get that calendar's default reminders. They show on Today and block time for placed tasks. [Decided]"
- Out of scope: replace "Calendars other than the primary calendar. [Decided]" with "Calendars other than the ones I can write to. [Decided]"

- [ ] **Step 2: Verify**

Run: `grep -n "primary\|Calendars other" SPEC.md`
Expected: no stale claims that busy time comes only from primary.

- [ ] **Step 3: Commit**

```bash
git add SPEC.md
git commit -m "docs: spec covers fixed events and all writable calendars"
```

---

## Self-Review

- **Spec coverage:** create (Task 2, 4), edit and delete (Task 4, 5), category as calendar with default reminders (Task 2, 4), busy time across calendars (Task 1, 3), Today view (Task 5), read-only calendars excluded (Task 1), past start refused (Task 2), Google as truth on refresh (Task 7), SPEC updated (Task 8). Every design section has a task.
- **Type consistency:** `calendarId` follows `token` in all `calendar.ts` functions. `FixedEvent` and `FixedEventInput` are defined in Tasks 2 and 3 and used the same way in Tasks 4 to 6.
- **Known risk:** `calendar.events` covering every writable calendar is assumed, not checked. Confirm in Task 1 with a real `calendarList` call before relying on it.
