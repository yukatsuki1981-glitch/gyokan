export const DEFAULT_APP_TITLE = "行間";

const APP_TITLE_STORAGE_PREFIX = "gyokan-app-title";

function storageKey(userId?: string | null) {
  return userId ? `${APP_TITLE_STORAGE_PREFIX}:${userId}` : APP_TITLE_STORAGE_PREFIX;
}

export function readAppTitle(userId?: string | null): string {
  if (typeof window === "undefined") return DEFAULT_APP_TITLE;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const trimmed = raw?.trim();
    return trimmed || DEFAULT_APP_TITLE;
  } catch {
    return DEFAULT_APP_TITLE;
  }
}

export function writeAppTitle(title: string, userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const trimmed = title.trim();
    if (!trimmed || trimmed === DEFAULT_APP_TITLE) {
      localStorage.removeItem(storageKey(userId));
      return;
    }
    localStorage.setItem(storageKey(userId), trimmed.slice(0, 24));
  } catch {
    /* ignore quota errors */
  }
}

export function appTitleMark(title: string) {
  const trimmed = title.trim() || DEFAULT_APP_TITLE;
  return trimmed.slice(0, 1);
}
