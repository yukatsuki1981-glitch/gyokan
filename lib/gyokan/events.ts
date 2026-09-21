import type { AppEvent } from "./types";

export function localDateISOFromTimestamp(timestamp: string): string {
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localTimeHHMMFromTimestamp(timestamp: string): string {
  const d = new Date(timestamp);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

/** Combine a `YYYY-MM-DD` date with an `HH:mm` time into a local ISO timestamp. */
export function combineLocalDateAndTime(dateISO: string, hhmm: string): string {
  const [y, mo, d] = dateISO.split("-").map((v) => parseInt(v, 10));
  const [h, mi] = hhmm.split(":").map((v) => parseInt(v, 10));
  return new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0, 0, 0).toISOString();
}

/** Reapply a local `HH:mm` onto the date portion of an existing timestamp. */
export function applyTimeToTimestamp(referenceTimestamp: string, hhmm: string): string {
  return combineLocalDateAndTime(localDateISOFromTimestamp(referenceTimestamp), hhmm);
}

const EVENT_TITLE_CHARS = 5;

export function truncateEventTitle(title: string, max = EVENT_TITLE_CHARS): string {
  if (title.length <= max) return title;
  return `${title.slice(0, max)}…`;
}

export function sortEventsByOrder(events: AppEvent[]): AppEvent[] {
  return [...events].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function groupEventsByDate(events: AppEvent[]): Map<string, AppEvent[]> {
  const map = new Map<string, AppEvent[]>();
  for (const event of sortEventsByOrder(events)) {
    const dateISO = localDateISOFromTimestamp(event.startTime);
    const list = map.get(dateISO) ?? [];
    list.push(event);
    map.set(dateISO, list);
  }
  return map;
}

export type EventDraftFields = {
  title: string;
  startTime: string;
  endTime: string;
  memo: string;
  allDay: boolean;
};

const ALL_DAY_TIME = "00:00";

/** An event is all-day when it's stored as local midnight with no end time. */
export function isAllDayEvent(item: AppEvent): boolean {
  return localTimeHHMMFromTimestamp(item.startTime) === ALL_DAY_TIME && !item.endTime;
}

export function eventFieldsFromItem(item: AppEvent): EventDraftFields {
  return {
    title: item.title,
    startTime: localTimeHHMMFromTimestamp(item.startTime),
    endTime: item.endTime ? localTimeHHMMFromTimestamp(item.endTime) : "",
    memo: item.memo ?? "",
    allDay: isAllDayEvent(item),
  };
}

/** Merge a locally-saved draft onto a server event, matching the task-draft fallback pattern. */
export function applyEventDraft(item: AppEvent, draft: EventDraftFields): AppEvent {
  if (draft.allDay) {
    return {
      ...item,
      title: draft.title,
      startTime: applyTimeToTimestamp(item.startTime, ALL_DAY_TIME),
      endTime: null,
      memo: draft.memo ?? item.memo,
    };
  }
  return {
    ...item,
    title: draft.title,
    startTime: draft.startTime
      ? applyTimeToTimestamp(item.startTime, draft.startTime)
      : item.startTime,
    endTime: draft.endTime
      ? applyTimeToTimestamp(item.endTime ?? item.startTime, draft.endTime)
      : null,
    memo: draft.memo ?? item.memo,
  };
}

export function eventDraftFieldsDiffer(item: AppEvent, draft: EventDraftFields): boolean {
  const baseline = eventFieldsFromItem(item);
  return (
    baseline.title !== draft.title ||
    baseline.startTime !== draft.startTime ||
    baseline.endTime !== draft.endTime ||
    baseline.allDay !== draft.allDay ||
    (baseline.memo ?? "") !== (draft.memo ?? "")
  );
}
