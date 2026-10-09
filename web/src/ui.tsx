import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Calendar as CalendarIcon, Check, ChevronDown, Clock, MoreHorizontal, X } from "lucide-react";
import { DayPicker } from "react-day-picker";

// An icon with a short text label. The icon is decorative; the label is the accessible name.
export function Label({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
      <span>{children}</span>
    </>
  );
}

// A form field's label text with its icon, for use inside a <label> element.
export function FieldLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="field-name">
      <Icon aria-hidden="true" size={16} strokeWidth={2.25} />
      <span>{children}</span>
    </span>
  );
}

// A bottom sheet for forms. A native dialog, so focus is trapped and Escape closes it.
export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className="sheet" aria-labelledby={titleId} onClose={onClose}>
      <div className="sheet-head">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
          <X aria-hidden="true" size={20} strokeWidth={2.25} />
        </button>
      </div>
      {open && children}
    </dialog>
  );
}

// Closes a popup when the reader taps outside it or presses Escape.
function useDismiss(open: boolean, ref: React.RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    // Escape closes the popup only; preventDefault stops a surrounding sheet from closing too.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, close]);
}

export interface Option<T extends string> {
  value: T;
  label: string;
}

// A custom dropdown: the current value on a button, and the options as rows in a popover list.
export function Dropdown<T extends string>({
  labelId,
  value,
  options,
  onChange,
}: {
  labelId: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, ref, close);
  const current = options.find((o) => o.value === value)?.label ?? "";
  return (
    <div className="dropdown" ref={ref}>
      <button
        type="button"
        className="dropdown-button"
        aria-labelledby={labelId}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span>{current}</span>
        <ChevronDown aria-hidden="true" size={18} strokeWidth={2.25} />
      </button>
      {open && (
        <div className="dropdown-list" role="listbox" aria-labelledby={labelId}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              <span>{o.label}</span>
              {o.value === value && <Check aria-hidden="true" size={18} strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

// Times of day in 15-minute steps, "HH:MM".
const TIME_OPTIONS: string[] = Array.from({ length: 96 }, (_, i) => `${pad(Math.floor(i / 4))}:${pad((i % 4) * 15)}`);

// A time of day: the value on a button, and the times as a scrollable list in a popover (the same style as the dropdown).
export function TimeField({
  labelId,
  ariaLabel,
  value,
  onChange,
  disabled,
}: {
  labelId?: string;
  ariaLabel?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, ref, close);
  // Open at the current value, so it is in view.
  useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: "center" });
  }, [open]);
  return (
    <div className="time-field" ref={ref}>
      <button
        type="button"
        className="dropdown-button"
        aria-labelledby={labelId}
        aria-label={labelId ? undefined : ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <Clock aria-hidden="true" size={18} strokeWidth={2.25} />
        <span>{value || "--:--"}</span>
      </button>
      {open && (
        <div className="dropdown-list time-list" role="listbox" aria-labelledby={labelId} aria-label={labelId ? undefined : ariaLabel} ref={listRef}>
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              type="button"
              role="option"
              aria-selected={t === value}
              onClick={() => {
                onChange(t);
                close();
              }}
            >
              <span>{t}</span>
              {t === value && <Check aria-hidden="true" size={18} strokeWidth={2.5} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function toYmd(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function fromYmd(ymd: string): Date {
  const [y = 0, m = 1, d = 1] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// A date and time: the date is picked in a calendar popover, the time is a native time input.
// The value is "YYYY-MM-DDTHH:MM", or "" for none. A date without a time uses defaultTime.
export function DateTimeField({
  labelId,
  value,
  onChange,
  defaultTime = "23:59",
  clearLabel,
}: {
  labelId: string;
  value: string;
  onChange: (value: string) => void;
  defaultTime?: string;
  clearLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, ref, close);
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  const shown = date ? fromYmd(date).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) : "Pick a date";
  return (
    <div className="datetime" ref={ref}>
      <div className="datetime-row">
        <div className="datetime-date">
          <button type="button" className="dropdown-button" aria-labelledby={labelId} aria-expanded={open} onClick={() => setOpen(!open)}>
            <CalendarIcon aria-hidden="true" size={18} strokeWidth={2.25} />
            <span>{shown}</span>
          </button>
          {open && (
            <div className="calendar-popover">
              <DayPicker
                mode="single"
                selected={date ? fromYmd(date) : undefined}
                defaultMonth={date ? fromYmd(date) : new Date()}
                onSelect={(day) => {
                  if (!day) return;
                  onChange(`${toYmd(day)}T${time || defaultTime}`);
                  close();
                }}
                classNames={{
                  root: "cal",
                  months: "cal-months",
                  month: "cal-month",
                  month_caption: "cal-caption",
                  caption_label: "cal-caption-label",
                  nav: "cal-nav",
                  button_previous: "cal-nav-button",
                  button_next: "cal-nav-button",
                  weekdays: "cal-weekdays",
                  weekday: "cal-weekday",
                  weeks: "cal-weeks",
                  week: "cal-week",
                  day: "cal-day",
                  day_button: "cal-day-button",
                  today: "cal-today",
                  selected: "cal-selected",
                  outside: "cal-outside",
                  disabled: "cal-disabled",
                }}
              />
            </div>
          )}
        </div>
        <TimeField ariaLabel="Time" value={time} disabled={!date} onChange={(t) => onChange(`${date}T${t}`)} />
      </div>
      {value && (
        <button type="button" className="text-button" onClick={() => onChange("")}>
          {clearLabel}
        </button>
      )}
    </div>
  );
}

// Priority as three visual choices with a coloured dot each (SPEC 2.7, assumed), not a plain select.
const PRIORITY_CHOICES = [
  { value: "high", label: "High" },
  { value: "normal", label: "Normal" },
  { value: "low", label: "Low" },
] as const;

export function PriorityChoice({
  labelId,
  value,
  onChange,
}: {
  labelId: string;
  value: "high" | "normal" | "low";
  onChange: (value: "high" | "normal" | "low") => void;
}) {
  return (
    <div className="priority-choice" role="radiogroup" aria-labelledby={labelId}>
      {PRIORITY_CHOICES.map((choice) => (
        <button
          key={choice.value}
          type="button"
          role="radio"
          aria-checked={value === choice.value}
          className={`priority-option ${choice.value}`}
          onClick={() => onChange(choice.value)}
        >
          <span className="priority-dot" aria-hidden="true" />
          <span>{choice.label}</span>
        </button>
      ))}
    </div>
  );
}

// A row's three-dot menu. Items run and close the menu.
export function RowMenu({
  label,
  items,
}: {
  label: string;
  items: { key: string; label: string; icon: LucideIcon; danger?: boolean; onSelect: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => setOpen(false);
  useDismiss(open, ref, close);
  return (
    <div className="row-menu" ref={ref}>
      <button type="button" className="icon-button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <MoreHorizontal aria-hidden="true" size={22} strokeWidth={2.25} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={item.danger ? "danger" : undefined}
              onClick={() => {
                close();
                item.onSelect();
              }}
            >
              <Label icon={item.icon}>{item.label}</Label>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
