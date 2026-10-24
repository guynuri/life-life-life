// Hash routing for the tabs (SPEC Pages): #/today, #/tasks, #/people, #/mood, #/settings. No router, no server fallback.
export const PAGE_IDS = ["today", "tasks", "people", "mood", "settings"] as const;
export type PageId = (typeof PAGE_IDS)[number];

// Unknown or empty hashes go to today.
export function parsePage(hash: string): PageId {
  const id = hash.replace(/^#\/?/, "");
  return (PAGE_IDS as readonly string[]).includes(id) ? (id as PageId) : "today";
}

export function formatPage(page: PageId): string {
  return `#/${page}`;
}

// A swipe moves one tab left or right. It must be mostly horizontal and long enough, so scrolling does not switch tabs.
// Returns null when nothing should change (short, vertical, or already at the end).
export function swipePage(page: PageId, dx: number, dy: number): PageId | null {
  if (Math.abs(dx) < 60 || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  const index = PAGE_IDS.indexOf(page) + (dx < 0 ? 1 : -1);
  return PAGE_IDS[index] ?? null;
}
