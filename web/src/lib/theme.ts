// Theme choice (SPEC Visual direction). "system" follows the device; light and dark are explicit.
// Storage is optional: if localStorage refuses, the page still renders and the choice lasts for this page view.
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "life-theme";

// Pure: anything that is not light or dark means system.
export function parseTheme(value: unknown): ThemeChoice {
  return value === "light" || value === "dark" ? value : "system";
}

export function readTheme(): ThemeChoice {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
}

// Returns false when storage refused the write.
export function writeTheme(choice: ThemeChoice): boolean {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
    return true;
  } catch {
    return false;
  }
}

// Sets the attribute the stylesheet reads. System removes it, so the media query decides.
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "system") delete root.dataset.theme;
  else root.dataset.theme = choice;
}
