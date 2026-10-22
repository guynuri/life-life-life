import { useCallback, useEffect, useState } from "react";
import { dueNow, everyone, intervalDaysFor, type Person, type Tier, validatePersonInput } from "./lib/people";
import { addPerson, listPeople, markContacted, removePerson, updatePerson } from "./lib/peopleStore";
import { Icon } from "./Icon";
import { Sheet } from "./Sheet";

type View = "due" | "all";
type Editing = { mode: "new" } | { mode: "edit"; person: Person } | null;

const TIERS: Tier[] = [1, 2, 3];
const TIER_DAYS: Record<Tier, number> = { 1: 7, 2: 14, 3: 30 };

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

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
      <section className="page">
        {loadError ? <p className="error">{loadError}</p> : <p className="status">Loading people...</p>}
      </section>
    );
  }

  const dueList = dueNow(people, now);
  const shown = view === "due" ? dueList : everyone(people);

  return (
    <section className="page">
      <header className="page-head row-between">
        <div>
          <h1 className="page-title">People</h1>
          <p className="page-sub">{people.length === 0 ? "Nobody added yet" : `${people.length} in your circle`}</p>
        </div>
        <button type="button" className="btn primary" onClick={() => setEditing({ mode: "new" })}>
          <Icon name="plus" size={18} />
          Add person
        </button>
      </header>

      {loadError && <p className="toast error">{loadError}</p>}
      {!editing && saveError && <p className="toast error">{saveError}</p>}

      <div className="segmented tabs" role="tablist" aria-label="People lists">
        <button type="button" role="tab" className="seg" aria-selected={view === "due"} onClick={() => setView("due")}>
          <Icon name="bell" size={18} />
          Due now ({dueList.length})
        </button>
        <button type="button" role="tab" className="seg" aria-selected={view === "all"} onClick={() => setView("all")}>
          <Icon name="people" size={18} />
          Everyone ({people.length})
        </button>
      </div>

      {shown.length === 0 && <p className="empty">{view === "due" ? "Nobody is due." : "No people yet."}</p>}

      <ul className="stack">
        {shown.map((p) => (
          <li key={p.id} className="card person">
            <div className="person-top">
              <span className={`avatar tier-${p.tier}`} aria-hidden="true">
                {initialsOf(p.name)}
              </span>
              <div className="row-body">
                <strong>{p.name}</strong>
                <span className="meta">
                  Tier {p.tier} · every {intervalDaysFor(p)} days
                </span>
                <span className="meta">
                  Last contacted {p.lastContactedAt ? new Date(p.lastContactedAt).toLocaleDateString() : "never"}
                </span>
              </div>
              <button
                type="button"
                className="btn primary small"
                aria-label={`Mark ${p.name} as contacted`}
                onClick={() => void write(() => markContacted(p.id))}
              >
                <Icon name="check" size={18} />
                Contacted
              </button>
            </div>
            <div className="task-actions">
              <button type="button" className="chip" onClick={() => setEditing({ mode: "edit", person: p })}>
                <Icon name="pencil" size={16} />
                Edit
              </button>
              {confirmRemoveId === p.id ? (
                <div className="confirm">
                  <span>Remove {p.name}?</span>
                  <button type="button" className="btn danger small" onClick={() => void write(() => removePerson(p.id))}>
                    Yes, remove
                  </button>
                  <button type="button" className="btn ghost small" onClick={() => setConfirmRemoveId(null)}>
                    Keep
                  </button>
                </div>
              ) : (
                <button type="button" className="chip danger" onClick={() => setConfirmRemoveId(p.id)}>
                  <Icon name="trash" size={16} />
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {editing && (
        <Sheet title={editing.mode === "edit" ? "Edit person" : "Add person"} onClose={() => setEditing(null)}>
          <PersonForm
            key={editing.mode === "edit" ? editing.person.id : "new"}
            person={editing.mode === "edit" ? editing.person : null}
            error={saveError}
            onCancel={() => setEditing(null)}
            onSave={(name, tier, interval) => {
              const result = validatePersonInput(name, tier, interval);
              if (!result.ok) return result.error;
              const target = editing.mode === "edit" ? editing.person : null;
              void write(() => (target ? updatePerson(target.id, result.value) : addPerson(result.value)));
              return null;
            }}
          />
        </Sheet>
      )}
    </section>
  );
}

function PersonForm({
  person,
  error,
  onSave,
  onCancel,
}: {
  person: Person | null;
  error: string | null;
  onSave: (name: string, tier: number, interval: string) => string | null;
  onCancel: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [tier, setTier] = useState<Tier>(person?.tier ?? 2);
  const [intervalText, setIntervalText] = useState(person?.intervalDays?.toString() ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault();
        setFormError(onSave(name, tier, intervalText));
      }}
    >
      {(formError || error) && <p className="toast error">{formError ?? error}</p>}
      <label className="field">
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span>How close</span>
        <div className="segmented" role="radiogroup" aria-label="Tier">
          {TIERS.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tier === t} className="seg" onClick={() => setTier(t)}>
              <span className="dots" aria-hidden="true">
                {TIERS.slice(0, t).map((d) => (
                  <i key={d} />
                ))}
              </span>
              Tier {t}
              <small>every {TIER_DAYS[t]} days</small>
            </button>
          ))}
        </div>
      </div>
      <label className="field">
        <span>Interval override in days (optional)</span>
        <input inputMode="numeric" value={intervalText} onChange={(e) => setIntervalText(e.target.value)} />
      </label>
      <div className="form-actions">
        <button type="button" className="btn ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="btn primary">
          Save
        </button>
      </div>
    </form>
  );
}
