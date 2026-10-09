// A small change signal (SPEC Pages: Today updates live). Writes to tasks, people, moods, and each placement run call
// notifyDataChanged, and pages that show that data reload. EventTarget keeps it free of the DOM, so it is unit-testable.
const bus = new EventTarget();

export function notifyDataChanged(): void {
  bus.dispatchEvent(new Event("changed"));
}

// Returns the unsubscribe function.
export function onDataChanged(listener: () => void): () => void {
  bus.addEventListener("changed", listener);
  return () => bus.removeEventListener("changed", listener);
}
