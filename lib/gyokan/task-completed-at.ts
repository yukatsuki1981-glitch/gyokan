import type { AppTask } from "./types";

const STORAGE_KEY = "gyokan-task-completed-at-v1";

export function normalizeTaskISODate(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1]! : String(value).trim();
}

export function isStoredRangeTask(task: Pick<AppTask, "date" | "dateEnd">) {
  return !!task.dateEnd && task.dateEnd !== task.date;
}

export function rememberTaskCompletedAt(taskId: string, iso: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const map = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
    if (iso) map[taskId] = iso;
    else delete map[taskId];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function readRememberedTaskCompletedAt(taskId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const map = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, string>;
    return normalizeTaskISODate(map[taskId]);
  } catch {
    return null;
  }
}

export function resolveTaskCompletedAt(
  task: Pick<AppTask, "id" | "date" | "dateEnd" | "done" | "completedAt">,
): string {
  const stored = normalizeTaskISODate(task.completedAt);
  if (stored) return stored;
  const remembered = readRememberedTaskCompletedAt(task.id);
  if (remembered) return remembered;
  if (isStoredRangeTask(task) && task.done) {
    return normalizeTaskISODate(task.dateEnd) ?? task.dateEnd!;
  }
  return normalizeTaskISODate(task.date) ?? task.date;
}

export function mergeRememberedTaskCompletedAt(task: AppTask): AppTask {
  if (!task.done || !isStoredRangeTask(task) || task.completedAt) return task;
  const remembered = readRememberedTaskCompletedAt(task.id);
  if (!remembered) return task;
  return { ...task, completedAt: remembered };
}
