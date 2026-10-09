// Hash routing for the four tabs (SPEC Pages): #/today, #/tasks, #/people, #/mood. No router, no server fallback.
export const PAGE_IDS = ["today", "tasks", "people", "mood"] as const;
export type PageId = (typeof PAGE_IDS)[number];

// Unknown or empty hashes go to today.
export function parsePage(hash: string): PageId {
  const id = hash.replace(/^#\/?/, "");
  return (PAGE_IDS as readonly string[]).includes(id) ? (id as PageId) : "today";
}

export function formatPage(page: PageId): string {
  return `#/${page}`;
}
