// Thin data access for moods. Errors are thrown so the screen can show them.
import { supabase } from "./supabase";
import type { MoodColor } from "./moodView";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

// Stored colors for days in [from, to], keyed by "YYYY-MM-DD". Blank days are absent.
export async function loadMoods(from: string, to: string): Promise<Map<string, MoodColor>> {
  const { data, error } = await client().from("moods").select("day, color").gte("day", from).lte("day", to);
  if (error) throw error;
  const rows = (data ?? []) as { day: string; color: MoodColor }[];
  return new Map(rows.map((row) => [row.day, row.color]));
}

// Clearing a day deletes its row; a blank day is never stored.
export async function saveMood(day: string, color: MoodColor | null): Promise<void> {
  const db = client();
  const { error } =
    color === null
      ? await db.from("moods").delete().eq("day", day)
      : await db.from("moods").upsert({ day, color }, { onConflict: "user_id,day" });
  if (error) throw error;
}
