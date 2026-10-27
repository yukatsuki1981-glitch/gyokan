export function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayISO() {
  return isoDate(new Date());
}

export function shiftISODate(iso: string, delta: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

export function formatDateJa(iso: string) {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

/**
 * A stored date as YYYY-MM-DD, or null when it isn't a real date. Accepts
 * "2026-10-27", "2026.10.27" (how project memos store it) and "2026/10/27",
 * with or without zero padding.
 */
export function toISODate(value: string | null | undefined): string | null {
  const m = /^\s*(\d{4})[-./](\d{1,2})[-./](\d{1,2})\s*$/.exec(value ?? "");
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(iso + "T12:00:00");
  return !Number.isNaN(d.getTime()) && isoDate(d) === iso ? iso : null;
}

/** "10月27日(月)"; an empty string for anything that isn't a YYYY-MM-DD date (never throws). */
export function formatDateShortJa(iso: string) {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}
