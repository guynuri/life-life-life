import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import type { SelectHTMLAttributes } from "react";

// An icon with a short text label. The icon is decorative; the label is the accessible name.
export function Label({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <>
      <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
      <span>{children}</span>
    </>
  );
}

// A form field's label text with its icon. Keeps the icon and text on one line inside the label element.
export function FieldLabel({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <span className="field-name">
      <Icon aria-hidden="true" size={16} strokeWidth={2.25} />
      <span>{children}</span>
    </span>
  );
}

// A select with a custom chevron. The native select is kept (appearance is reset in CSS), so the list stays native.
export function SelectField(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="select-wrap">
      <select {...props} />
      <ChevronDown aria-hidden="true" className="select-chevron" size={18} strokeWidth={2.25} />
    </div>
  );
}
