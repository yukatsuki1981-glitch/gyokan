import type {
  AppCase,
  AppMemo,
  AppProject,
  AppTask,
  DbCase,
  DbMemo,
  DbProject,
  DbTask,
} from "./types";

export function buildProjectMaps(projects: AppProject[]) {
  const idToName: Record<string, string> = {};
  const nameToId: Record<string, string> = {};
  for (const p of projects) {
    idToName[p.id] = p.name;
    nameToId[p.name] = p.id;
  }
  return { idToName, nameToId };
}

export function mapDbProject(row: DbProject): AppProject {
  return {
    id: row.id,
    name: row.name,
    accentColor: row.accent_color,
    sortOrder: row.sort_order,
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
    project: row.project_id ? (idToName[row.project_id] ?? "") : "",
    starred: row.starred,
    sortOrder: row.sort_order,
  };
}

export function mapDbCase(row: DbCase, idToName: Record<string, string>): AppCase {
  return {
    id: row.id,
    title: row.title,
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
    sortOrder: row.sort_order,
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

export function mapTaskToDb(
  task: AppTask,
  userId: string,
  nameToId: Record<string, string>,
) {
  return {
    id: task.id,
    user_id: userId,
    project_id: nameToId[task.project] ?? null,
    title: task.title,
    time_label: task.time,
    task_date: task.date,
    date_end: task.dateEnd ?? null,
    done: task.done,
    starred: task.starred ?? false,
    sort_order: task.sortOrder,
  };
}

export function mapCaseToDb(
  item: AppCase,
  userId: string,
  nameToId: Record<string, string>,
) {
  const projectId = nameToId[item.project];
  if (!projectId) {
    throw new Error(`Unknown project: ${item.project}`);
  }
  return {
    id: item.id,
    user_id: userId,
    project_id: projectId,
    title: item.title,
    status: item.status,
    status_tone: item.statusTone,
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
