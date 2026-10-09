import { useCallback, useEffect, useState, type FormEvent } from "react";
import { dueNow, everyone, intervalDaysFor, isDue, type Person, type Tier, validatePersonInput } from "./lib/people";
import { addPerson, listPeople, markContacted, removePerson, updatePerson } from "./lib/peopleStore";
import { Check, Heart, Layers, Pencil, Repeat, Trash2, User, UserCheck, UserMinus, UserPlus, X } from "lucide-react";
import { Dropdown, FieldLabel, Label, RowMenu, Sheet, type Option } from "./ui";

// One list, no sub-tabs (SPEC 3.3). Due people sit at the top with a visible mark.
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
      <section className="people page-people">
        {loadError ? <p className="error">{loadError}</p> : <p className="status">Loading people...</p>}
      </section>
    );
  }

  // Due people first (tier, then most overdue), then everyone else by name.
  const due = dueNow(people, now);
  const dueIds = new Set(due.map((p) => p.id));
  const rest = everyone(people).filter((p) => !dueIds.has(p.id));
  const shown = [...due, ...rest];

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
        {shown.map((p) => {
          const isDueNow = isDue(p, now);
          return (
            <li key={p.id} className="person-row">
              <div className="person-body">
                <p className="person-name">
                  {p.name}
                  {!isDueNow && <Heart className="not-due-mark" role="img" aria-label="Not due yet" size={14} strokeWidth={2.25} />}
                </p>
                <p className="person-meta">
                  {isDueNow && (
                    <span className="due">
                      <span className="due-dot" aria-hidden="true" />
                      Due
                    </span>
                  )}
                  <span>
                    Tier {p.tier} · every {intervalDaysFor(p)} days · last contacted{" "}
                    {p.lastContactedAt ? new Date(p.lastContactedAt).toLocaleDateString() : "never"}
                  </span>
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
              <RowMenu
                label={`Person actions: ${p.name}`}
                items={[
                  { key: "contacted", label: "Mark contacted", icon: UserCheck, onSelect: () => void write(() => markContacted(p.id)) },
                  { key: "edit", label: "Edit", icon: Pencil, onSelect: () => setEditing({ mode: "edit", person: p }) },
                  { key: "remove", label: "Remove", icon: UserMinus, danger: true, onSelect: () => setConfirmRemoveId(p.id) },
                ]}
              />
            </li>
          );
        })}
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
        <Dropdown
          labelId="tier-label"
          value={String(tier)}
          options={TIER_OPTIONS}
          onChange={(value) => setTier(Number(value) as Tier)}
        />
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
