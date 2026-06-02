import { DEFAULT_PROJECT_ACCENT } from "./constants";
import type { DbCase, DbProject, DbTask } from "./types";

type Row = Record<string, unknown>;

export function isMissingColumnError(
  error: { message?: string; code?: string },
  column: string,
) {
  const msg = error.message?.toLowerCase() ?? "";
  return (
    msg.includes(column.toLowerCase()) &&
    (msg.includes("column") || msg.includes("schema cache"))
  );
}

export function isMissingTableError(error: { message?: string; code?: string }) {
  return (
    error.code === "PGRST205" ||
    (error.message?.includes("Could not find the table") ?? false)
  );
}

export function normalizeProjectRow(row: Row, index: number): DbProject {
  const accent =
    (row.accent_color as string | undefined) ??
    (row.color as string | undefined) ??
    DEFAULT_PROJECT_ACCENT;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    name: String(row.name ?? ""),
    accent_color: accent,
    sort_order: Number(row.sort_order ?? index),
  };
}

export function normalizeTaskRow(row: Row, index: number): DbTask {
  const taskDate = String(row.task_date ?? row.date ?? "");
  const dateEndRaw = row.date_end as string | null | undefined;
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    project_id: (row.project_id as string | null) ?? null,
    case_id: (row.case_id as string | null) ?? null,
    title: String(row.title ?? ""),
    time_label: String(row.time_label ?? row.time ?? ""),
    task_date: taskDate,
    date_end: dateEndRaw ?? null,
    done: Boolean(row.done),
    starred: Boolean(row.starred ?? false),
    sort_order: Number(row.sort_order ?? index),
  };
}

export function normalizeCaseRow(row: Row, index: number): DbCase {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    project_id: String(row.project_id ?? ""),
    title: String(row.title ?? row.name ?? ""),
    status: String(row.status ?? "情報収集中"),
    status_tone: (row.status_tone as DbCase["status_tone"]) ?? "emerald",
    deadline: String(row.deadline ?? ""),
    progress: Number(row.progress ?? 0),
    goal: String(row.goal ?? ""),
    subtasks_done: Number(row.subtasks_done ?? 0),
    subtasks_total: Number(row.subtasks_total ?? 5),
    comments_count: Number(row.comments_count ?? 0),
    done: Boolean(row.done ?? false),
    created_at: String(row.created_at ?? ""),
    completed_at: (row.completed_at as string | null) ?? null,
    sort_order: Number(row.sort_order ?? index),
  };
}

export function sortByOrder<T extends { sort_order: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order);
}

/** Keep one row per project name (earliest sort_order wins). */
export function dedupeProjectsByName(rows: DbProject[]): DbProject[] {
  const best = new Map<string, DbProject>();
  for (const row of rows) {
    const prev = best.get(row.name);
    if (!prev || row.sort_order < prev.sort_order) {
      best.set(row.name, row);
    }
  }
  return sortByOrder([...best.values()]);
}

export function toLegacyProjectInsert(row: {
  id: string;
  user_id: string;
  name: string;
  accent_color: string;
  sort_order: number;
}) {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    color: row.accent_color,
    sort_order: row.sort_order,
  };
}

export function toLegacyTaskUpsert(row: {
  id: string;
  user_id: string;
  project_id: string | null;
  case_id?: string | null;
  title: string;
  time_label: string;
  task_date: string;
  date_end: string | null;
  done: boolean;
  starred?: boolean;
  sort_order: number;
}) {
  const legacy: Row = {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    title: row.title,
    date: row.task_date,
    time: row.time_label,
    done: row.done,
  };
  if (row.case_id != null) legacy.case_id = row.case_id;
  if (row.starred != null) legacy.starred = row.starred;
  if (row.sort_order != null) legacy.sort_order = row.sort_order;
  if (row.date_end) legacy.date_end = row.date_end;
  return legacy;
}

export function toLegacyCaseUpsert(row: {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  deadline: string;
  progress: number;
  goal: string;
  created_at: string;
  sort_order: number;
}) {
  const legacy: Row = {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    title: row.title,
    name: row.title,
    deadline: row.deadline,
    progress: row.progress,
    goal: row.goal,
    created_at: row.created_at,
    sort_order: row.sort_order,
  };
  return legacy;
}
