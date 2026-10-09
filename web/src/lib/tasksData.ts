// Thin Supabase access for tasks. Every failure throws so the screen can show it.
import { supabase } from "./supabase";
import type { NewTask, Task, TaskEdit, TaskType, ConditionPlace } from "./tasks";

interface TaskRow {
  id: string;
  title: string;
  type: TaskType;
  duration_min: number;
  topic: string | null;
  deadline: string | null;
  spread_days: number | null;
  condition_place: ConditionPlace;
  scheduled_start: string | null;
  scheduled_end: string | null;
  calendar_event_id: string | null;
  held: boolean;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function fromRow(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    durationMin: row.duration_min,
    topic: row.topic,
    deadline: row.deadline,
    spreadDays: row.spread_days,
    conditionPlace: row.condition_place,
    scheduledStart: row.scheduled_start,
    scheduledEnd: row.scheduled_end,
    calendarEventId: row.calendar_event_id,
    held: row.held,
  };
}

function check<T>(result: { data: T | null; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  if (result.data === null) throw new Error("No data returned.");
  return result.data;
}

export async function listTasks(): Promise<Task[]> {
  const result = await client().from("tasks").select("*").order("created_at", { ascending: true });
  return check<TaskRow[]>(result).map(fromRow);
}

export async function insertTask(task: NewTask): Promise<void> {
  const row = {
    title: task.title,
    type: task.type,
    duration_min: task.durationMin,
    topic: task.topic,
    deadline: task.deadline,
    spread_days: task.spreadDays,
    condition_place: task.conditionPlace,
  };
  check(await client().from("tasks").insert(row).select());
}

export async function updateTaskEdit(id: string, edit: TaskEdit): Promise<void> {
  const row = { title: edit.title, duration_min: edit.durationMin, deadline: edit.deadline };
  check(await client().from("tasks").update(row).eq("id", id).select());
}

// Clears the placement and holds the task out of automatic placement (SPEC 2.5).
export async function holdTask(id: string): Promise<void> {
  const row = { scheduled_start: null, scheduled_end: null, calendar_event_id: null, held: true };
  check(await client().from("tasks").update(row).eq("id", id).select());
}

export async function deleteTask(id: string): Promise<void> {
  const result = await client().from("tasks").delete().eq("id", id);
  if (result.error) throw new Error(result.error.message);
}
