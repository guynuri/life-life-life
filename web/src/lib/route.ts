// Hash routing for the five tabs (SPEC Pages): #/today, #/tasks, #/people, #/mood, #/settings. No router, no server fallback.
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
