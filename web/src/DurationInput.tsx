import type { DurationFields } from "./lib/duration";

// Duration as two fields, hours and minutes, e.g. 2 h 45 min. Either may be left blank.
export function DurationInput({ value, onChange }: { value: DurationFields; onChange: (value: DurationFields) => void }) {
  return (
    <fieldset className="field">
      <legend>Duration</legend>
      <div className="duration-inputs">
        <label className="duration-part">
          <input
            inputMode="numeric"
            aria-label="Hours"
            placeholder="0"
            value={value.hours}
            onChange={(e) => onChange({ ...value, hours: e.target.value })}
          />
          <span>h</span>
        </label>
        <label className="duration-part">
          <input
            inputMode="numeric"
            aria-label="Minutes"
            placeholder="0"
            value={value.minutes}
            onChange={(e) => onChange({ ...value, minutes: e.target.value })}
          />
          <span>min</span>
        </label>
      </div>
    </fieldset>
  );
}
