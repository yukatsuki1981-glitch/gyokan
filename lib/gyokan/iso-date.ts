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

export function weekdayJa(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat("ja-JP", { weekday: "short" }).format(d);
}
