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
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

export function formatDateShortJa(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat("ja-JP", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

/**
 * Moves a YYYY-MM-DD date by whole months, keeping the day of the month —
 * or the month's last day when it has no such day (01-31 + 1 → 02-28/29).
 */
export function shiftISOMonth(iso: string, delta: number) {
  const [y, m, d] = iso.split("-").map((v) => parseInt(v, 10));
  const first = new Date(y, m - 1 + delta, 1);
  const lastDay = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  return isoDate(new Date(first.getFullYear(), first.getMonth(), Math.min(d, lastDay)));
}
