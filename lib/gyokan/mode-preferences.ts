import type { AppModeKey, ModePreferences } from "./types";

export const DEFAULT_MODE_PREFERENCES: ModePreferences = {
  defaultMode: "work",
  showWorkMode: true,
  showPrivateMode: true,
};

/** At least one mode is always shown; a stored "both hidden" falls back to showing both. */
export function normalizeModePreferences(prefs: Partial<ModePreferences>): ModePreferences {
  const showWorkMode = prefs.showWorkMode !== false;
  const showPrivateMode = prefs.showPrivateMode !== false;
  const bothHidden = !showWorkMode && !showPrivateMode;
  return {
    defaultMode: prefs.defaultMode === "private" ? "private" : "work",
    showWorkMode: bothHidden ? true : showWorkMode,
    showPrivateMode: bothHidden ? true : showPrivateMode,
  };
}

/**
 * Reads the mode columns off a user_preferences row. Returns null when the
 * row doesn't carry them (no row yet, or migration
 * 20261012_add_mode_preferences.sql not applied) so callers fall back.
 */
export function modePreferencesFromRow(row: Record<string, unknown> | null | undefined): ModePreferences | null {
  if (!row || !("show_work_mode" in row) || !("show_private_mode" in row) || !("default_mode" in row)) {
    return null;
  }
  return normalizeModePreferences({
    defaultMode: row.default_mode === "private" ? "private" : "work",
    showWorkMode: row.show_work_mode !== false,
    showPrivateMode: row.show_private_mode !== false,
  });
}

export function modePreferencesToRow(prefs: ModePreferences) {
  return {
    default_mode: prefs.defaultMode,
    show_work_mode: prefs.showWorkMode,
    show_private_mode: prefs.showPrivateMode,
  };
}

export function isModeShown(prefs: ModePreferences, mode: AppModeKey) {
  return mode === "work" ? prefs.showWorkMode : prefs.showPrivateMode;
}

/** The mode to open in: the chosen default when both are shown, otherwise the only one shown. */
export function startupMode(prefs: ModePreferences): AppModeKey {
  if (prefs.showWorkMode && prefs.showPrivateMode) return prefs.defaultMode;
  return prefs.showPrivateMode ? "private" : "work";
}

// A per-device copy, so the setting still applies (and the app opens in the
// right mode straight away) when the server columns are missing or slow.
const CACHE_PREFIX = "gyokan-mode-preferences";

export function readCachedModePreferences(userId: string): ModePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}:${userId}`);
    return raw ? normalizeModePreferences(JSON.parse(raw) as Partial<ModePreferences>) : null;
  } catch {
    return null;
  }
}

export function writeCachedModePreferences(userId: string, prefs: ModePreferences) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${CACHE_PREFIX}:${userId}`, JSON.stringify(prefs));
  } catch {
    // ignore quota errors
  }
}
