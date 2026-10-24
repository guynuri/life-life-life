// Light or dark for the whole app. Dark is the default: it is easier on the eyes. A choice made in Settings is kept on this device.

export type Theme = "light" | "dark";

const KEY = "life-theme";

// Pure: a stored choice wins; anything else is dark.
export function resolveTheme(stored: string | null): Theme {
  return stored === "light" ? "light" : "dark";
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
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#14161c" : "#f5f4f1");
}
