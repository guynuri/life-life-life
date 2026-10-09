import { useCallback, useEffect, useState, type FormEvent } from "react";
import { intervalDaysFor, orderPeople, type Person, type Tier, validatePersonInput } from "./lib/people";
import { addPerson, listPeople, markContacted, removePerson, updatePerson } from "./lib/peopleStore";
import { Check, Heart, Layers, Pencil, Repeat, Trash2, User, UserMinus, UserPlus, X } from "lucide-react";
import { Dropdown, FieldLabel, Label, RowMenu, Sheet, type Option } from "./ui";

// SPEC 3.3: two groups. Due people (need contact) first, with an empty heart; then the rest (not due), greyed, with a
// full heart. Each group is ordered by last contact, oldest first.
type Editing = { mode: "new" } | { mode: "edit"; person: Person } | null;

const TIER_OPTIONS: Option<string>[] = [
  { value: "1", label: "Tier 1 · every 7 days" },
  { value: "2", label: "Tier 2 · every 14 days" },
  { value: "3", label: "Tier 3 · every 30 days" },
];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function People({ refreshTick }: { refreshTick: number }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [editing, setEditing] = useState<Editing>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Kept until the next successful save, so a later successful re-read does not hide it.
  const [saveError, setSaveError] = useState<string | null>(null);
  // The person whose heart is floating hearts right now (a short burst after a press).
  const [burst, setBurst] = useState<string | null>(null);

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

  // The heart marks the person contacted at once (the row moves down), then the save runs. A failed save reloads the
  // stored list, which puts the person back where they were, with the error shown (SPEC principles).
  function contact(p: Person) {
    setBurst(p.id);
    window.setTimeout(() => setBurst((current) => (current === p.id ? null : current)), 900);
    const at = new Date().toISOString();
    setPeople((list) => list && list.map((x) => (x.id === p.id ? { ...x, lastContactedAt: at } : x)));
    void write(() => markContacted(p.id));
  }

  if (people === null) {
    return (
      <section className="people page-people">
        {loadError ? <p className="error">{loadError}</p> : <p className="status">Loading people...</p>}
      </section>
    );
  }

  const shown = orderPeople(people, now);

  return (
    <section className="people page-people" aria-labelledby="people-heading">
      <div className="page-head">
        <h2 id="people-heading">People</h2>
        <button type="button" className="fab" aria-label="Add person" onClick={() => setEditing({ mode: "new" })}>
          <UserPlus aria-hidden="true" size={22} strokeWidth={2.25} />
        </button>
      </div>
      {loadError && <p className="error">{loadError}</p>}
      {!editing && saveError && <p className="error">{saveError}</p>}

      {shown.length === 0 && <p className="status">No people yet. Use the plus button to add one.</p>}

      <ul className="person-list">
        {shown.map(({ person: p, due }) => (
          <li key={p.id} className={due ? "person-row" : "person-row settled"}>
            <div className="person-body">
              <p className="person-name">
                {p.name}
                {due && (
                  <span className="due">
                    <span className="due-dot" aria-hidden="true" />
                    Due
                  </span>
                )}
              </p>
              <p className="person-meta">
                Tier {p.tier} · every {intervalDaysFor(p)} days · last contacted{" "}
                {p.lastContactedAt ? new Date(p.lastContactedAt).toLocaleDateString() : "never"}
              </p>
              {confirmRemoveId === p.id && (
                <div className="task-confirm">
                  <span>Remove {p.name}?</span>
                  <button type="button" className="danger" onClick={() => void write(() => removePerson(p.id))}>
                    <Label icon={Trash2}>Confirm remove</Label>
                  </button>
                  <button type="button" className="secondary" onClick={() => setConfirmRemoveId(null)}>
                    <Label icon={X}>Cancel</Label>
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="contact"
              aria-label={`Mark ${p.name} contacted`}
              aria-pressed={!due}
              onClick={() => contact(p)}
            >
              <Heart aria-hidden="true" size={22} strokeWidth={2.25} fill={due ? "none" : "currentColor"} />
              {burst === p.id && (
                <span className="float-hearts" aria-hidden="true">
                  <Heart className="float-heart f1" size={12} fill="currentColor" />
                  <Heart className="float-heart f2" size={10} fill="currentColor" />
                  <Heart className="float-heart f3" size={14} fill="currentColor" />
                </span>
              )}
            </button>
            <RowMenu
              label={`Person actions: ${p.name}`}
              items={[
                { key: "edit", label: "Edit", icon: Pencil, onSelect: () => setEditing({ mode: "edit", person: p }) },
                { key: "remove", label: "Remove", icon: UserMinus, danger: true, onSelect: () => setConfirmRemoveId(p.id) },
              ]}
            />
          </li>
        ))}
      </ul>

      <Sheet open={editing !== null} title={editing?.mode === "edit" ? "Edit person" : "Add person"} onClose={() => setEditing(null)}>
        {editing && (
          <PersonForm
            person={editing.mode === "edit" ? editing.person : null}
            onCancel={() => setEditing(null)}
            onSave={(name, tier, interval) => {
              const result = validatePersonInput(name, tier, interval);
              if (!result.ok) return result.error;
              const target = editing.mode === "edit" ? editing.person : null;
              void write(() => (target ? updatePerson(target.id, result.value) : addPerson(result.value)));
              return null;
            }}
            saveError={saveError}
          />
        )}
      </Sheet>
    </section>
  );
}

function PersonForm({
  person,
  onSave,
  onCancel,
  saveError,
}: {
  person: Person | null;
  onSave: (name: string, tier: number, interval: string) => string | null;
  onCancel: () => void;
  saveError: string | null;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [tier, setTier] = useState<Tier>(person?.tier ?? 2);
  const [intervalText, setIntervalText] = useState(person?.intervalDays?.toString() ?? "");
  const [formError, setFormError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setFormError(onSave(name, tier, intervalText));
  }

  return (
    <form className="task-form" aria-label="Person form" onSubmit={submit}>
      {formError && <p className="error">{formError}</p>}
      {saveError && <p className="error">{saveError}</p>}
      <label>
        <FieldLabel icon={User}>Name</FieldLabel>
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="field">
        <span id="tier-label">
          <FieldLabel icon={Layers}>Tier</FieldLabel>
        </span>
        <Dropdown labelId="tier-label" value={String(tier)} options={TIER_OPTIONS} onChange={(value) => setTier(Number(value) as Tier)} />
      </div>
      <label>
        <FieldLabel icon={Repeat}>Interval override in days (optional)</FieldLabel>
        <input inputMode="numeric" value={intervalText} onChange={(e) => setIntervalText(e.target.value)} />
      </label>
      <div className="form-actions">
        <button type="submit">
          <Label icon={Check}>Save</Label>
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          <Label icon={X}>Cancel</Label>
        </button>
      </div>
    </form>
  );
}
