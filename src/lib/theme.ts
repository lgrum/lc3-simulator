import { useSyncExternalStore } from "react";

export type ThemePreference = "system" | "light" | "dark";
export type Theme = "light" | "dark";

export const THEME_PREFERENCES: ReadonlyArray<ThemePreference> = [
  "system",
  "light",
  "dark",
];

const STORAGE_KEY = "lc3sim.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";
/** The browser UI color for each theme; matches --case in styles.css. */
const THEME_COLORS: Record<Theme, string> = {
  light: "#e7e4dc",
  dark: "#2a2c2e",
};

function isPreference(value: unknown): value is ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference);
}

export function readPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    // Storage can be blocked; fall back to the system setting.
    return "system";
  }
}

export function resolveTheme(
  preference: ThemePreference,
  systemDark: boolean,
): Theme {
  if (preference === "system") return systemDark ? "dark" : "light";
  return preference;
}

/** Puts the theme on <html> for the CSS variables and browser UI. */
function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
}

/**
 * Runs before the first paint, from the prerendered shell, so the page never
 * flashes the wrong theme. It must stand alone: it is inlined as a string.
 */
export const themeScript = `(function () {
  var preference = "system";
  try {
    var stored = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
    if (${JSON.stringify(THEME_PREFERENCES)}.indexOf(stored) >= 0) preference = stored;
  } catch (error) {}
  var theme = preference === "system"
    ? (matchMedia(${JSON.stringify(DARK_QUERY)}).matches ? "dark" : "light")
    : preference;
  var root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", ${JSON.stringify(THEME_COLORS)}[theme]);
})()`;

type ThemeState = { preference: ThemePreference; theme: Theme };

const listeners = new Set<() => void>();
let state: ThemeState | undefined;

function prefersDark(): boolean {
  return matchMedia(DARK_QUERY).matches;
}

function update(preference: ThemePreference): void {
  const theme = resolveTheme(preference, prefersDark());
  state = { preference, theme };
  applyTheme(theme);
  for (const listener of listeners) listener();
}

function getState(): ThemeState {
  if (!state) {
    const preference = readPreference();
    state = { preference, theme: resolveTheme(preference, prefersDark()) };
  }
  return state;
}

/** Follows the system setting, and the setting changed in other tabs. */
function watch(): () => void {
  const media = matchMedia(DARK_QUERY);
  const onSystemChange = () => {
    if (getState().preference === "system") update("system");
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) update(readPreference());
  };
  media.addEventListener("change", onSystemChange);
  window.addEventListener("storage", onStorage);
  return () => {
    media.removeEventListener("change", onSystemChange);
    window.removeEventListener("storage", onStorage);
  };
}

let unwatch: (() => void) | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  unwatch ??= watch();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      unwatch?.();
      unwatch = undefined;
    }
  };
}

export function setThemePreference(preference: ThemePreference): void {
  try {
    if (preference === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Not saved, but still applied for this visit.
  }
  update(preference);
}

/** The saved preference and the theme it resolves to. */
export function useTheme(): ThemeState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** For non-React code, e.g. CodeMirror extensions. */
export const themeStore = { getState, subscribe };
