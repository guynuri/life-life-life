// Light or dark for the whole app. A choice made in Settings is kept on this device. Without one, the phone's setting decides.

export type Theme = "light" | "dark";

const KEY = "life-theme";

// Pure: a stored choice wins; anything else follows the system.
export function resolveTheme(stored: string | null, systemDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemDark ? "dark" : "light";
}

// Browser storage can be blocked (private windows), so a failed read counts as no choice.
export function readStoredTheme(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // Blocked storage: the choice still applies for this visit.
  }
}

// Sets the attribute the stylesheet reads, and the status bar color that iOS takes from the page.
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#15112a" : "#fff7ef");
}
