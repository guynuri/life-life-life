import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import { duePeople, TIER_INTERVAL_DAYS, type Person } from "./due";
import "./people.css";

export function PeoplePanel() {
  const [people, setPeople] = useState<Person[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const { data, error } = await supabase!.from("people").select("*");
    if (error) setError(error.message);
    else setPeople(data ?? []);
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const name = String(data.get("name") ?? "").trim();
    if (!name) return;
    const override = String(data.get("interval") ?? "").trim();
    if (override && !/^[1-9]\d*$/.test(override)) {
      return setError("Days must be a whole number of at least 1.");
    }
    const { error } = await supabase!.from("people").insert({
      name,
      tier: Number(data.get("tier")),
      interval_days: override ? Number(override) : null,
    });
    if (error) return setError(error.message);
    form.reset();
    load();
  }

  async function contacted(id: string) {
    const { error } = await supabase!
      .from("people")
      .update({ last_contacted_at: new Date().toISOString() })
      .eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  async function remove(id: string) {
    const { error } = await supabase!.from("people").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  const due = duePeople(people, Date.now());

  return (
    <section className="people">
      <h2>Due now</h2>
      {due.length === 0 && <p className="status">Nobody is due.</p>}
      <ul className="people-list">
        {due.map((p) => (
          <li key={p.id}>
            <span>
              {p.name} <small>tier {p.tier}</small>
            </span>
            <button type="button" onClick={() => contacted(p.id)}>
              Contacted
            </button>
          </li>
        ))}
      </ul>

      <h2>Everyone</h2>
      <ul className="people-list">
        {people.map((p) => (
          <li key={p.id}>
            <span>
              {p.name}{" "}
              <small>
                tier {p.tier}, every {p.interval_days ?? TIER_INTERVAL_DAYS[p.tier]} days
              </small>
            </span>
            <span className="people-actions">
              <button type="button" onClick={() => contacted(p.id)}>
                Contacted
              </button>
              <button type="button" onClick={() => remove(p.id)}>
                Remove
              </button>
            </span>
          </li>
        ))}
      </ul>

      <form className="people-add" onSubmit={add}>
        <input name="name" placeholder="Name" aria-label="Name" required />
        <select name="tier" defaultValue="2" aria-label="Tier">
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
        <input name="interval" type="number" min="1" step="1" placeholder="Days (default by tier)" aria-label="Days between reach-outs" />
        <button type="submit">Add person</button>
      </form>

      {error && <p className="status">{error}</p>}
    </section>
  );
}
