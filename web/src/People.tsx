import { useCallback, useEffect, useState } from "react";
import { dueNow, everyone, intervalDaysFor, type Person, type Tier, validatePersonInput } from "./lib/people";
import { addPerson, listPeople, markContacted, removePerson, updatePerson } from "./lib/peopleStore";

type View = "due" | "all";
type Editing = { mode: "new" } | { mode: "edit"; person: Person } | null;

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function People({ refreshTick }: { refreshTick: number }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View>("due");
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Kept until the next successful save, so a later successful re-read does not hide it.
  const [saveError, setSaveError] = useState<string | null>(null);

  // Re-reads the stored list, so the screen shows what is saved, not what was attempted.
  const reload = useCallback(async () => {
    try {
      setPeople(await listPeople());
      setLoadError(null);
    } catch (e) {
      setLoadError(`Could not load people: ${errorText(e)}`);
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    void reload();
    const onForeground = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    return () => {
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
    };
  }, [reload, refreshTick]);

  async function write(action: () => Promise<void>) {
    try {
      await action();
      setSaveError(null);
      setEditing(null);
      setConfirmRemoveId(null);
    } catch (e) {
      setSaveError(`Save failed: ${errorText(e)}`);
    }
    await reload();
  }

  if (people === null) {
    return (
      <section>
        {loadError ? <p className="error">{loadError}</p> : <p className="status">Loading people...</p>}
      </section>
    );
  }

  const dueList = dueNow(people, now);
  const shown = view === "due" ? dueList : everyone(people);

  return (
    <section>
      <h2>People</h2>
      {loadError && <p className="error">{loadError}</p>}
      {saveError && <p className="error">{saveError}</p>}

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === "due"} onClick={() => setView("due")}>
          Due now ({dueList.length})
        </button>
        <button type="button" role="tab" aria-selected={view === "all"} onClick={() => setView("all")}>
          Everyone ({people.length})
        </button>
      </div>

      {shown.length === 0 && <p className="status">{view === "due" ? "Nobody is due." : "No people yet."}</p>}

      <ul className="list">
        {shown.map((p) => (
          <li key={p.id}>
            <div className="row-title">{p.name}</div>
            <div className="status">
              Tier {p.tier} · every {intervalDaysFor(p)} days · last contacted{" "}
              {p.lastContactedAt ? new Date(p.lastContactedAt).toLocaleDateString() : "never"}
            </div>
            <div className="row-actions">
              <button type="button" onClick={() => void write(() => markContacted(p.id))}>
                Contacted
              </button>
              <button type="button" className="secondary" onClick={() => setEditing({ mode: "edit", person: p })}>
                Edit
              </button>
              {confirmRemoveId === p.id ? (
                <>
                  <button type="button" className="danger" onClick={() => void write(() => removePerson(p.id))}>
                    Confirm remove
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirmRemoveId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="secondary" onClick={() => setConfirmRemoveId(p.id)}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing ? (
        <PersonForm
          key={editing.mode === "edit" ? editing.person.id : "new"}
          person={editing.mode === "edit" ? editing.person : null}
          onCancel={() => setEditing(null)}
          onSave={(name, tier, interval) => {
            const result = validatePersonInput(name, tier, interval);
            if (!result.ok) return result.error;
            const target = editing.mode === "edit" ? editing.person : null;
            void write(() => (target ? updatePerson(target.id, result.value) : addPerson(result.value)));
            return null;
          }}
        />
      ) : (
        <button type="button" onClick={() => setEditing({ mode: "new" })}>
          Add person
        </button>
      )}
    </section>
  );
}

function PersonForm({
  person,
  onSave,
  onCancel,
}: {
  person: Person | null;
  onSave: (name: string, tier: number, interval: string) => string | null;
  onCancel: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [tier, setTier] = useState<Tier>(person?.tier ?? 2);
  const [intervalText, setIntervalText] = useState(person?.intervalDays?.toString() ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <form
      className="person-form"
      onSubmit={(e) => {
        e.preventDefault();
        setFormError(onSave(name, tier, intervalText));
      }}
    >
      <h3>{person ? "Edit person" : "Add person"}</h3>
      {formError && <p className="error">{formError}</p>}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Tier
        <select value={tier} onChange={(e) => setTier(Number(e.target.value) as Tier)}>
          <option value={1}>1 (every 7 days)</option>
          <option value={2}>2 (every 14 days)</option>
          <option value={3}>3 (every 30 days)</option>
        </select>
      </label>
      <label>
        Interval override in days (optional)
        <input inputMode="numeric" value={intervalText} onChange={(e) => setIntervalText(e.target.value)} />
      </label>
      <div className="row-actions">
        <button type="submit">Save</button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
