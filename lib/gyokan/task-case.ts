import type { AppCase, AppTask } from "./types";

export function buildCaseById(cases: AppCase[]): Record<string, AppCase> {
  const byId: Record<string, AppCase> = {};
  for (const item of cases) {
    byId[item.id] = item;
  }
  return byId;
}

export function normalizeTaskForStorage(task: AppTask): AppTask {
  const caseId = task.caseId?.trim() || undefined;
  const project = task.project?.trim() ?? "";
  return { ...task, caseId, project };
}

export function enrichTaskWithCase(
  task: AppTask,
  caseById: Record<string, AppCase>,
): AppTask {
  const normalized = normalizeTaskForStorage(task);
  if (!normalized.caseId) return normalized;
  const linked = caseById[normalized.caseId];
  if (!linked) return normalized;
  return { ...normalized, project: linked.project };
}

export function isUnassignedTask(task: AppTask) {
  return !task.caseId && !task.project.trim();
}

export function taskBelongsToProject(
  task: AppTask,
  project: string,
  caseById: Record<string, AppCase>,
): boolean {
  if (task.caseId) {
    return caseById[task.caseId]?.project === project;
  }
  return task.project === project;
}

/** Unassigned tasks (no project / case) are always visible in any view. */
export function taskVisibleInView(
  task: AppTask,
  project: string,
  isAllProjects: boolean,
  caseById: Record<string, AppCase>,
): boolean {
  if (isAllProjects || isUnassignedTask(task)) return true;
  return taskBelongsToProject(task, project, caseById);
}

export function caseSelectLabel(item: AppCase) {
  return `${item.project} / ${item.title}`;
}

export function pickDefaultCaseId(
  ongoingCases: AppCase[],
  project?: string,
): string | undefined {
  const pool = project
    ? ongoingCases.filter((c) => c.project === project)
    : ongoingCases;
  return pool[0]?.id;
}
