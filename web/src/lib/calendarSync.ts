// Ties Google Calendar to the stored tasks and sessions (SPEC 1, 2.5). Google is called first where an event changes,
// so a failed Google call leaves the stored state as it was.
import { busyHorizon, busySpans, decideSync, eventBody } from "./calendarEvents";
import { createEvent, deleteEvent, getEvent, listEvents, moveEvent } from "./calendar";
import { deleteSessionsOf, deleteTask, getWorkHours, holdTask, insertSessions, listSessions, listTasks, moveSession, setUnplaced, type NewSession, type StoredSession, setDone } from "./tasksData";
import { schedule, type Placement } from "./scheduler";
import { newlyUnplacedTitles, placementReminder } from "./reminders";
import { notifyDataChanged } from "./dataEvents";
import { insertReminder } from "./remindersData";
import type { Task } from "./tasks";


// Moved events move their session; deleted events unschedule their task (SPEC 1). Runs before placement.
export async function syncCalendar(token: string | null): Promise<void> {
  const deletedTasks = new Set<string>();
  for (const session of await listSessions()) {
    if (session.calendarEventId === null) continue;
    const decision = decideSync(session, await getEvent(token, session.calendarEventId));
    if (decision.kind === "move") await moveSession(session.id, decision.start, decision.end);
    if (decision.kind === "deleted") deletedTasks.add(session.taskId);
  }
  for (const taskId of deletedTasks) await unscheduleTask(token, taskId);
}

// Places unplaced, unheld tasks, creating one event per session. All-or-nothing for the run: if Google or the
// database fails, the events created in this run are removed again and the error is thrown.
// Every placement run tells the pages that show tasks and sessions to reload (SPEC Pages: Today updates live).
export async function placeTasks(token: string | null, now: number): Promise<Placement[]> {
  try {
    return await placeTasksRun(token, now);
  } finally {
    notifyDataChanged();
  }
}

async function placeTasksRun(token: string | null, now: number): Promise<Placement[]> {
  await syncCalendar(token);
  const [tasks, sessions, work] = await Promise.all([listTasks(), listSessions(), getWorkHours()]);
  const horizon = busyHorizon(tasks.filter((t) => !t.held && !sessions.some((s) => s.taskId === t.id)), now);
  const external = busySpans(await listEvents(token, now, horizon));
  const placed = schedule(tasks, sessions, now, work, external);
  const rows = placed.length > 0 ? await insertPlacements(token, tasks, placed) : [];
  await announceUnplaced(tasks, sessions, rows, now);
  return rows;
}

async function insertPlacements(token: string | null, tasks: Task[], placed: Placement[]): Promise<NewSession[]> {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const created: string[] = [];
  const rows: NewSession[] = [];
  try {
    for (const p of placed) {
      const task = byId.get(p.taskId);
      if (!task) continue;
      const id = crypto.randomUUID();
      let calendarEventId: string | null = null;
      if (task.type !== "work_day") {
        calendarEventId = await createEvent(token, eventBody(task, { id, start: p.start, end: p.end }));
        created.push(calendarEventId);
      }
      rows.push({ id, taskId: p.taskId, start: p.start, end: p.end, calendarEventId });
    }
    await insertSessions(rows);
  } catch (error) {
    await Promise.all(created.map((eventId) => deleteEvent(token, eventId).catch(() => undefined)));
    throw error;
  }
  return rows;
}

// SPEC 5: one batched placement message per run. A task is announced as unplaced only when it becomes unplaced
// in this run and has a deadline it cannot meet. The unplaced flag is saved after the message is queued, so a failed run is retried.
async function announceUnplaced(tasks: Task[], sessions: StoredSession[], placedRows: NewSession[], now: number): Promise<void> {
  const placedIds = new Set([...sessions.map((s) => s.taskId), ...placedRows.map((r) => r.taskId)]);
  const unplaced = tasks.filter((t) => !t.held && !placedIds.has(t.id));
  const newly = newlyUnplacedTitles(unplaced.map((t) => ({ title: t.title, deadline: t.deadline, wasUnplaced: t.unplaced })));
  const titles = new Map(tasks.map((t) => [t.id, t.title]));
  const reminder = placementReminder(
    placedRows.map((r) => ({ taskTitle: titles.get(r.taskId) ?? "task", start: r.start })),
    newly,
    now,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    crypto.randomUUID(),
  );
  if (reminder) await insertReminder(reminder);

  const unplacedIds = new Set(unplaced.map((t) => t.id));
  const changed = tasks.filter((t) => t.unplaced !== unplacedIds.has(t.id));
  await setUnplaced(changed.filter((t) => !t.unplaced).map((t) => t.id), true);
  await setUnplaced(changed.filter((t) => t.unplaced).map((t) => t.id), false);
}

// Completing removes the task's events and sessions, then marks it done; a done task is not placed again (SPEC 2.7, assumed).
// Un-completing only clears the flag, so the next placement run places the task again.
export async function completeTask(token: string | null, taskId: string, done: boolean): Promise<void> {
  if (done) {
    await removeEvents(token, taskId);
    await deleteSessionsOf(taskId);
  }
  await setDone(taskId, done);
}

// Removes the task's events from Google, then holds the task (SPEC 2.5). Used by Unschedule and by sync.
export async function unscheduleTask(token: string | null, taskId: string): Promise<void> {
  await removeEvents(token, taskId);
  await holdTask(taskId);
}

// Removes the task's events from Google, then deletes its sessions so placement runs again (SPEC 2.5, edits).
export async function replacePlacement(token: string | null, taskId: string): Promise<void> {
  await removeEvents(token, taskId);
  await deleteSessionsOf(taskId);
}

// Removes the task's events from Google, then deletes the task and its sessions (SPEC 2.5).
export async function deleteTaskWithEvents(token: string | null, taskId: string): Promise<void> {
  await removeEvents(token, taskId);
  await deleteTask(taskId);
}

// Updates the event's time first, then the stored session.
export async function moveSessionWithEvent(token: string | null, session: StoredSession, start: number, end: number): Promise<void> {
  if (session.calendarEventId !== null) await moveEvent(token, session.calendarEventId, { start, end });
  await moveSession(session.id, start, end);
}

async function removeEvents(token: string | null, taskId: string): Promise<void> {
  for (const session of await listSessions()) {
    if (session.taskId === taskId && session.calendarEventId !== null) await deleteEvent(token, session.calendarEventId);
  }
}
