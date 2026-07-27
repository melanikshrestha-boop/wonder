/**
 * Wonder theme — light (Habits desk) or dark (default black canvas).
 * Habits page is always forced light in CSS regardless of this setting.
 */

export type WonderTheme = "light" | "dark";

const KEY = "wonder-theme-v1";

export function loadTheme(): WonderTheme {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function saveTheme(theme: WonderTheme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* ignore */
  }
}

/** Apply to <html> so CSS can theme shell + every surface. */
export function applyTheme(theme: WonderTheme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("theme-light", theme === "light");
  root.classList.toggle("theme-dark", theme === "dark");
  root.style.colorScheme = theme === "light" ? "light" : "dark";
}

export function toggleTheme(current: WonderTheme): WonderTheme {
  const next: WonderTheme = current === "light" ? "dark" : "light";
  saveTheme(next);
  applyTheme(next);
  return next;
}
