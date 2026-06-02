import type { AppCase, AppTask } from "./types";

export function buildCaseById(cases: AppCase[]): Record<string, AppCase> {
  const byId: Record<string, AppCase> = {};
  for (const item of cases) {
    byId[item.id] = item;
  }
  return byId;
}

export function enrichTaskWithCase(
  task: AppTask,
  caseById: Record<string, AppCase>,
): AppTask {
  if (!task.caseId) return task;
  const linked = caseById[task.caseId];
  if (!linked) return task;
  return { ...task, project: linked.project };
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
