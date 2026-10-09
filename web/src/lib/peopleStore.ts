// Thin Supabase access for people. Every failure is thrown so the UI can show it.
import { supabase } from "./supabase";
import type { Person, PersonInput, Tier } from "./people";

import { notifyDataChanged } from "./dataEvents";
interface PersonRow {
  id: string;
  name: string;
  tier: number;
  interval_days: number | null;
  last_contacted_at: string | null;
  created_at: string;
}

const COLUMNS = "id,name,tier,interval_days,last_contacted_at,created_at";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

function fromRow(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    tier: row.tier as Tier,
    intervalDays: row.interval_days,
    lastContactedAt: row.last_contacted_at,
    createdAt: row.created_at,
  };
}

function toRow(input: PersonInput) {
  return { name: input.name, tier: input.tier, interval_days: input.intervalDays };
}

export async function listPeople(): Promise<Person[]> {
  const rows = check(
    await client().from("people").select(COLUMNS).order("created_at", { ascending: true }),
  ) as PersonRow[];
  return rows.map(fromRow);
}

export async function addPerson(input: PersonInput): Promise<void> {
  check(await client().from("people").insert(toRow(input)));
  notifyDataChanged();
}

export async function updatePerson(id: string, input: PersonInput): Promise<void> {
  check(await client().from("people").update(toRow(input)).eq("id", id));
  notifyDataChanged();
}

export async function markContacted(id: string): Promise<void> {
  check(await client().from("people").update({ last_contacted_at: new Date().toISOString() }).eq("id", id));
  notifyDataChanged();
}

export async function removePerson(id: string): Promise<void> {
  check(await client().from("people").delete().eq("id", id));
  notifyDataChanged();
}
