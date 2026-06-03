import type { AppCase, AppProject } from "./types";

/** Parse `YYYY.MM.DD` / `YYYY-MM-DD` case created_at for sorting. */
export function parseCaseCreatedAt(createdAt: string): number {
  const normalized = createdAt.replace(/\./g, "-").replace(/\//g, "-");
  const [y, m, d] = normalized.split("-").map(Number);
  if (!y || !m || !d) return 0;
  return new Date(y, m - 1, d).getTime();
}

/** Project sidebar order → within project, oldest input first (左上から). */
export function sortCasesByProjectOrder(
  list: AppCase[],
  projects: AppProject[],
): AppCase[] {
  const orderByName = new Map(
    projects.map((p, index) => [p.name, p.sortOrder ?? index]),
  );

  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    const pa = orderByName.get(a.project) ?? 9999;
    const pb = orderByName.get(b.project) ?? 9999;
    if (pa !== pb) return pa - pb;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return parseCaseCreatedAt(a.createdAt) - parseCaseCreatedAt(b.createdAt);
  });
}

/** Within one case: input order (sort_order), active before done. */
export function sortTasksInCase<T extends { done: boolean; sortOrder: number }>(
  list: T[],
): T[] {
  const active = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);
  const byInput = (a: T, b: T) => a.sortOrder - b.sortOrder;
  return [...active.sort(byInput), ...done.sort(byInput)];
}
