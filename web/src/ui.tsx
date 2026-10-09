import type { LucideIcon } from "lucide-react";

// An icon with a short text label. The icon is decorative; the label is the accessible name.
export function Label({ icon: Icon, children }: { icon: LucideIcon; children: React.ReactNode }) {
  return (
    <>
      <Icon aria-hidden="true" size={18} strokeWidth={2.25} />
      <span>{children}</span>
    </>
  );
}
