import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROJECT_ACCENT, DEFAULT_PROJECT_NAMES, LEGACY_STORAGE_KEYS } from "./constants";
import {
  buildProjectMaps,
  mapCaseToDb,
  mapDbCase,
  mapDbMemo,
  mapDbProject,
  mapDbTask,
  mapMemoToDb,
  mapProjectToDb,
  mapTaskToDb,
  newUuid,
} from "./mappers";
import type {
  AppCase,
  AppMemo,
  AppProject,
  AppTask,
  DbCase,
  DbMemo,
  DbProject,
  DbTask,
  GyokanData,
} from "./types";

type LegacyTask = {
  id: string;
  title: string;
  time: string;
  date: string;
  dateEnd?: string;
  done: boolean;
  project: string;
};

type LegacyCase = {
  id: string;
  title: string;
  project: string;
  status: string;
  statusTone: AppCase["statusTone"];
  deadline: string;
  progress: number;
  goal: string;
  subtasksDone: number;
  subtasksTotal: number;
  comments: number;
  done: boolean;
  createdAt: string;
  completedAt: string | null;
};

type LegacyMemo = {
  id: string;
  project: string;
  date: string;
  body: string;
};

function isValidHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export async function seedDefaultProjects(
  supabase: SupabaseClient,
  userId: string,
  colors: Record<string, string> = {},
): Promise<AppProject[]> {
  const rows = DEFAULT_PROJECT_NAMES.map((name, index) => ({
    id: newUuid(),
    user_id: userId,
    name,
    accent_color: isValidHex(colors[name] ?? "") ? colors[name].toUpperCase() : DEFAULT_PROJECT_ACCENT,
    sort_order: index,
  }));

  const { data, error } = await supabase.from("projects").insert(rows).select("*");
  if (error) throw error;
  return (data as DbProject[]).map(mapDbProject).sort((a, b) => a.sortOrder - b.sortOrder);
}

export async function fetchGyokanData(
  supabase: SupabaseClient,
  userId: string,
): Promise<GyokanData> {
  const [
    { data: projectRows, error: projectsError },
    { data: taskRows, error: tasksError },
    { data: caseRows, error: casesError },
    { data: memoRows, error: memosError },
    { data: prefRows, error: prefsError },
  ] = await Promise.all([
    supabase.from("projects").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("tasks").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("cases").select("*").eq("user_id", userId).order("sort_order"),
    supabase.from("project_memos").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
    supabase.from("user_preferences").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  if (projectsError) throw projectsError;
  if (tasksError) throw tasksError;
  if (casesError) throw casesError;
  if (memosError) throw memosError;
  if (prefsError) throw prefsError;

  let projects = (projectRows as DbProject[] | null)?.map(mapDbProject) ?? [];

  if (projects.length === 0) {
    const legacyColors = readLegacyColors();
    projects = await seedDefaultProjects(supabase, userId, legacyColors);
    const imported = readLegacyData();
    if (imported.hasData) {
      await importLegacyData(supabase, userId, projects, imported);
      return fetchGyokanData(supabase, userId);
    }
  }

  const { idToName } = buildProjectMaps(projects);

  return {
    projects,
    tasks: ((taskRows as DbTask[] | null) ?? []).map((r) => mapDbTask(r, idToName)),
    cases: ((caseRows as DbCase[] | null) ?? []).map((r) => mapDbCase(r, idToName)),
    memos: ((memoRows as DbMemo[] | null) ?? []).map((r) => mapDbMemo(r, idToName)),
    lastViewDate: prefRows?.last_view_date ?? null,
  };
}

function readLegacyColors(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw =
      localStorage.getItem(LEGACY_STORAGE_KEYS.colors) ??
      localStorage.getItem(LEGACY_STORAGE_KEYS.colorsV1);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const result: Record<string, string> = {};
    for (const name of DEFAULT_PROJECT_NAMES) {
      const value = parsed[name];
      if (value && isValidHex(value)) result[name] = value.toUpperCase();
    }
    return result;
  } catch {
    return {};
  }
}

function readLegacyData() {
  if (typeof window === "undefined") {
    return { hasData: false, tasks: [] as LegacyTask[], cases: [] as LegacyCase[], memos: [] as LegacyMemo[] };
  }
  try {
    const tasksRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.tasks);
    const casesRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.cases);
    const memosRaw = localStorage.getItem(LEGACY_STORAGE_KEYS.memos);
    const tasks: LegacyTask[] = tasksRaw ? JSON.parse(tasksRaw) : [];
    const cases: LegacyCase[] = casesRaw ? JSON.parse(casesRaw) : [];
    const memos: LegacyMemo[] = memosRaw ? JSON.parse(memosRaw) : [];
    const hasData =
      (Array.isArray(tasks) && tasks.length > 0) ||
      (Array.isArray(cases) && cases.length > 0) ||
      (Array.isArray(memos) && memos.length > 0);
    return {
      hasData,
      tasks: Array.isArray(tasks) ? tasks : [],
      cases: Array.isArray(cases) ? cases : [],
      memos: Array.isArray(memos) ? memos : [],
    };
  } catch {
    return { hasData: false, tasks: [], cases: [], memos: [] };
  }
}

async function importLegacyData(
  supabase: SupabaseClient,
  userId: string,
  projects: AppProject[],
  legacy: ReturnType<typeof readLegacyData>,
) {
  const { nameToId } = buildProjectMaps(projects);
  const fallbackProjectId = projects[0]?.id;

  if (legacy.tasks.length > 0) {
    const rows = legacy.tasks.map((t, index) => ({
      id: newUuid(),
      user_id: userId,
      project_id: nameToId[t.project] ?? fallbackProjectId ?? null,
      title: t.title,
      time_label: t.time,
      task_date: t.date,
      date_end: t.dateEnd && t.dateEnd !== t.date ? t.dateEnd : null,
      done: t.done,
      starred: false,
      sort_order: index,
    }));
    await supabase.from("tasks").insert(rows);
  }

  if (legacy.cases.length > 0) {
    const rows = legacy.cases.map((c, index) => ({
      id: newUuid(),
      user_id: userId,
      project_id: nameToId[c.project] ?? fallbackProjectId!,
      title: c.title,
      status: c.status,
      status_tone: c.statusTone,
      deadline: c.deadline ?? "",
      progress: c.progress ?? 0,
      goal: c.goal ?? "",
      subtasks_done: c.subtasksDone ?? 0,
      subtasks_total: c.subtasksTotal ?? 5,
      comments_count: c.comments ?? 0,
      done: c.done,
      created_at: c.createdAt,
      completed_at: c.completedAt,
      sort_order: index,
    }));
    await supabase.from("cases").insert(rows);
  }

  if (legacy.memos.length > 0) {
    const rows = legacy.memos.map((m) => ({
      id: newUuid(),
      user_id: userId,
      project_id: nameToId[m.project] ?? fallbackProjectId!,
      memo_date: m.date,
      body: m.body,
    }));
    await supabase.from("project_memos").insert(rows);
  }
}

export async function upsertTask(
  supabase: SupabaseClient,
  task: AppTask,
  userId: string,
  nameToId: Record<string, string>,
) {
  const row = mapTaskToDb(task, userId, nameToId);
  const { error } = await supabase.from("tasks").upsert(row);
  if (error) throw error;
}

export async function deleteTaskDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertCase(
  supabase: SupabaseClient,
  item: AppCase,
  userId: string,
  nameToId: Record<string, string>,
) {
  const row = mapCaseToDb(item, userId, nameToId);
  const { error } = await supabase.from("cases").upsert(row);
  if (error) throw error;
}

export async function upsertCasesBatch(
  supabase: SupabaseClient,
  items: AppCase[],
  userId: string,
  nameToId: Record<string, string>,
) {
  if (items.length === 0) return;
  const rows = items.map((item) => mapCaseToDb(item, userId, nameToId));
  const { error } = await supabase.from("cases").upsert(rows);
  if (error) throw error;
}

export async function upsertTasksBatch(
  supabase: SupabaseClient,
  items: AppTask[],
  userId: string,
  nameToId: Record<string, string>,
) {
  if (items.length === 0) return;
  const rows = items.map((item) => mapTaskToDb(item, userId, nameToId));
  const { error } = await supabase.from("tasks").upsert(rows);
  if (error) throw error;
}

export async function upsertMemo(
  supabase: SupabaseClient,
  memo: AppMemo,
  userId: string,
  nameToId: Record<string, string>,
) {
  const row = mapMemoToDb(memo, userId, nameToId);
  const { error } = await supabase.from("project_memos").upsert(row);
  if (error) throw error;
}

export async function deleteMemoDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("project_memos").delete().eq("id", id);
  if (error) throw error;
}

export async function updateProjectColor(
  supabase: SupabaseClient,
  projectId: string,
  accentColor: string,
) {
  const { error } = await supabase
    .from("projects")
    .update({ accent_color: accentColor })
    .eq("id", projectId);
  if (error) throw error;
}

export async function upsertProject(
  supabase: SupabaseClient,
  project: AppProject,
  userId: string,
) {
  const row = mapProjectToDb(project, userId);
  const { error } = await supabase.from("projects").upsert(row);
  if (error) throw error;
}

export async function upsertProjectsBatch(
  supabase: SupabaseClient,
  items: AppProject[],
  userId: string,
) {
  if (items.length === 0) return;
  const rows = items.map((item) => mapProjectToDb(item, userId));
  const { error } = await supabase.from("projects").upsert(rows);
  if (error) throw error;
}

export async function saveLastViewDate(
  supabase: SupabaseClient,
  userId: string,
  date: string,
) {
  const { error } = await supabase.from("user_preferences").upsert({
    user_id: userId,
    last_view_date: date,
  });
  if (error) throw error;
}

export function projectsToColorMap(projects: AppProject[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const p of projects) {
    map[p.name] = p.accentColor;
  }
  return map;
}

export function assignSortOrders<T extends { sortOrder: number }>(items: T[]): T[] {
  return items.map((item, index) => ({ ...item, sortOrder: index }));
}
