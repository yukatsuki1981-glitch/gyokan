import type {
  AppCase,
  AppDailyDiary,
  AppDailyMemo,
  AppMemo,
  AppProject,
  AppTask,
  DbCase,
  DbDailyDiary,
  DbDailyMemo,
  DbMemo,
  DbProject,
  DbTask,
} from "./types";
import { DEFAULT_PROJECT_ACCENT } from "./constants";
import { normalizeTaskISODate } from "./task-completed-at";

export function buildProjectMaps(projects: AppProject[]) {
  const idToName: Record<string, string> = {};
  const nameToId: Record<string, string> = {};
  for (const p of projects) {
    idToName[p.id] = p.name;
    nameToId[p.name] = p.id;
  }
  return { idToName, nameToId };
}

export function resolveProjectId(
  projectName: string,
  nameToId: Record<string, string>,
): string | null {
  const direct = nameToId[projectName];
  if (direct) return direct;
  const lower = projectName.trim().toLowerCase();
  for (const [name, id] of Object.entries(nameToId)) {
    if (name.trim().toLowerCase() === lower) return id;
  }
  return null;
}

export function mapDbProject(row: DbProject): AppProject {
  return {
    id: row.id,
    name: row.name,
    accentColor: row.accent_color || DEFAULT_PROJECT_ACCENT,
    sortOrder: row.sort_order ?? 0,
  };
}

export function mapProjectToDb(project: AppProject, userId: string) {
  return {
    id: project.id,
    user_id: userId,
    name: project.name,
    accent_color: project.accentColor,
    sort_order: project.sortOrder,
  };
}

export function mapDbTask(row: DbTask, idToName: Record<string, string>): AppTask {
  const date = row.task_date;
  const dateEnd =
    row.date_end && row.date_end !== date ? row.date_end : undefined;
  return {
    id: row.id,
    title: row.title,
    time: row.time_label,
    date,
    dateEnd,
    done: row.done,
    completedAt: normalizeTaskISODate(row.completed_at),
    project: row.project_id ? (idToName[row.project_id] ?? "") : "",
    caseId: row.case_id ?? undefined,
    starred: row.starred,
    sortOrder: row.sort_order ?? 0,
  };
}

export function mapDbCase(row: DbCase, idToName: Record<string, string>): AppCase {
  const title = (row.title || "").trim();
  return {
    id: row.id,
    title: title || "（無題）",
    project: idToName[row.project_id] ?? "",
    status: row.status,
    statusTone: row.status_tone,
    deadline: row.deadline,
    progress: row.progress,
    goal: row.goal,
    subtasksDone: row.subtasks_done,
    subtasksTotal: row.subtasks_total,
    comments: row.comments_count,
    done: row.done,
    createdAt: row.created_at,
    completedAt: row.completed_at,
    sortOrder: row.sort_order ?? 0,
  };
}

export function mapDbMemo(row: DbMemo, idToName: Record<string, string>): AppMemo {
  return {
    id: row.id,
    project: idToName[row.project_id] ?? "",
    date: row.memo_date,
    body: row.body,
  };
}

export function mapDbDailyMemo(row: DbDailyMemo): AppDailyMemo {
  return {
    id: row.id,
    date: row.memo_date,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapDbDailyDiary(row: DbDailyDiary): AppDailyDiary {
  return {
    id: row.id,
    date: row.diary_date,
    body: row.body,
    createdAt: row.created_at,
  };
}

export function mapTaskToDb(
  task: AppTask,
  userId: string,
  nameToId: Record<string, string>,
  caseById: Record<string, AppCase> = {},
) {
  const normalized = {
    ...task,
    caseId: task.caseId?.trim() || undefined,
    project: task.project?.trim() ?? "",
  };
  const projectName =
    (normalized.caseId && caseById[normalized.caseId]?.project) ||
    normalized.project;
  const projectId = projectName ? (nameToId[projectName] ?? null) : null;
  const completedAt = normalizeTaskISODate(normalized.completedAt);
  return {
    id: normalized.id,
    user_id: userId,
    project_id: projectId,
    case_id: normalized.caseId ?? null,
    title: normalized.title,
    time_label: normalized.time,
    task_date: normalized.date,
    date_end: normalized.dateEnd ?? null,
    done: normalized.done,
    ...(completedAt ? { completed_at: completedAt } : {}),
    starred: normalized.starred ?? false,
    sort_order: normalized.sortOrder,
  };
}

const VALID_STATUS_TONES = new Set<AppCase["statusTone"]>([
  "blue",
  "amber",
  "emerald",
  "violet",
]);

export function mapCaseToDb(
  item: AppCase,
  userId: string,
  nameToId: Record<string, string>,
) {
  const projectId = resolveProjectId(item.project, nameToId);
  if (!projectId) {
    throw new Error(`Unknown project: ${item.project}`);
  }
  const statusTone = VALID_STATUS_TONES.has(item.statusTone)
    ? item.statusTone
    : "emerald";
  return {
    id: item.id,
    user_id: userId,
    project_id: projectId,
    title: item.title.trim() || "（無題）",
    name: item.title.trim() || "（無題）",
    status: item.status || "情報収集中",
    status_tone: statusTone,
    deadline: item.deadline,
    progress: item.progress,
    goal: item.goal,
    subtasks_done: item.subtasksDone,
    subtasks_total: item.subtasksTotal,
    comments_count: item.comments,
    done: item.done,
    created_at: item.createdAt,
    completed_at: item.completedAt,
    sort_order: item.sortOrder,
  };
}

export function mapDailyMemoToDb(memo: AppDailyMemo, userId: string) {
  return {
    id: memo.id,
    user_id: userId,
    memo_date: memo.date,
    body: memo.body,
  };
}

export function mapDailyDiaryToDb(diary: AppDailyDiary, userId: string) {
  return {
    id: diary.id,
    user_id: userId,
    diary_date: diary.date,
    body: diary.body,
  };
}

export function mapMemoToDb(
  memo: AppMemo,
  userId: string,
  nameToId: Record<string, string>,
) {
  const projectId = nameToId[memo.project];
  if (!projectId) {
    throw new Error(`Unknown project: ${memo.project}`);
  }
  return {
    id: memo.id,
    user_id: userId,
    project_id: projectId,
    memo_date: memo.date,
    body: memo.body,
  };
}

export function newUuid() {
  return crypto.randomUUID();
}
