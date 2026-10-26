// Thin data access for moods. Errors are thrown so the screen can show them.
import { supabase } from "./supabase";
import type { MoodEntry, Moods } from "./moodView";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// Stored entries for days in [from, to], keyed by "YYYY-MM-DD". Blank days are absent.
export async function loadMoods(from: string, to: string): Promise<Moods> {
  const { data, error } = await client().from("moods").select("day, emotion, note").gte("day", from).lte("day", to);
  if (error) throw error;
  const rows = (data ?? []) as { day: string; emotion: MoodEntry["emotion"]; note: string | null }[];
  return new Map(rows.map((row) => [row.day, { emotion: row.emotion, note: row.note }]));
}

// Clearing a day deletes its row; a blank day is never stored.
export async function saveMood(day: string, entry: MoodEntry | null): Promise<void> {
  const db = client();
  const { error } =
    entry === null
      ? await db.from("moods").delete().eq("day", day)
      : await db.from("moods").upsert({ day, emotion: entry.emotion, note: entry.note }, { onConflict: "user_id,day" });
  if (error) throw error;
}
