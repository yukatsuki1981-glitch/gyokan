import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROJECT_ACCENT, DEFAULT_PROJECT_NAMES, LEGACY_STORAGE_KEYS, PRIVATE_PROJECT_ACCENT, PRIVATE_PROJECT_NAME, INITIAL_SEED_PROJECT_NAMES } from "./constants";
import {
  buildProjectMaps,
  mapCaseToDb,
  mapDbCase,
  mapDbDailyDiary,
  mapDbDailyMemo,
  mapDbMemo,
  mapDbProject,
  mapDbTask,
  mapDailyDiaryToDb,
  mapDailyMemoToDb,
  mapMemoToDb,
  mapProjectToDb,
  mapTaskToDb,
  newUuid,
} from "./mappers";
import {
  buildCaseUpsertAttempts,
  dedupeProjectsByName,
  isAuthOrPolicyError,
  isMissingColumnError,
  isMissingTableError,
  isSchemaMismatchError,
  normalizeCaseRow,
  normalizeProjectRow,
  normalizeTaskRow,
  sortByOrder,
  toLegacyProjectInsert,
  buildTaskUpsertAttempts,
  toLegacyTaskUpsert,
} from "./schema-compat";
import { enrichTaskWithCase } from "./task-case";
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
  GyokanData,
} from "./types";

async function fetchTaskRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<DbTask[]> {
  const res = await supabase.from("tasks").select("*").eq("user_id", userId);
  if (res.error) throw res.error;

  const rows = ((res.data as Record<string, unknown>[] | null) ?? []).map(
    normalizeTaskRow,
  );
  return sortByOrder(rows);
}

async function fetchProjectRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<DbProject[]> {
  const res = await supabase.from("projects").select("*").eq("user_id", userId);
  if (res.error) throw res.error;

  const rows = ((res.data as Record<string, unknown>[] | null) ?? []).map(
    normalizeProjectRow,
  );
  return dedupeProjectsByName(rows);
}

async function fetchCaseRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<DbCase[]> {
  const res = await supabase.from("cases").select("*").eq("user_id", userId);
  if (res.error) throw res.error;

  const rows = ((res.data as Record<string, unknown>[] | null) ?? []).map(
    normalizeCaseRow,
  );
  return sortByOrder(rows);
}

async function fetchDailyMemoRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<DbDailyMemo[]> {
  const res = await supabase
    .from("daily_memos")
    .select("*")
    .eq("user_id", userId)
    .order("memo_date")
    .order("created_at");
  if (res.error) {
    if (isMissingTableError(res.error)) {
      console.warn("daily_memos unavailable (run migration if needed):", res.error.message);
      return [];
    }
    throw res.error;
  }
  return (res.data as DbDailyMemo[] | null) ?? [];
}

async function fetchDailyDiaryRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<DbDailyDiary[]> {
  const res = await supabase
    .from("daily_diaries")
    .select("*")
    .eq("user_id", userId)
    .order("diary_date")
    .order("created_at");
  if (res.error) {
    if (isMissingTableError(res.error)) {
      console.warn("daily_diaries unavailable (run migration if needed):", res.error.message);
      return [];
    }
    throw res.error;
  }
  return (res.data as DbDailyDiary[] | null) ?? [];
}

async function fetchProjectMemoRows(
  supabase: SupabaseClient,
  userId: string,
): Promise<DbMemo[]> {
  const res = await supabase
    .from("project_memos")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (res.error) {
    if (isMissingTableError(res.error)) {
      console.warn("project_memos unavailable (run migration if needed):", res.error.message);
      return [];
    }
    throw res.error;
  }
  return (res.data as DbMemo[] | null) ?? [];
}

async function fetchLastViewDate(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const res = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (res.error) {
    if (isMissingTableError(res.error)) {
      console.warn("user_preferences unavailable (run migration if needed):", res.error.message);
      return null;
    }
    throw res.error;
  }
  return res.data?.last_view_date ?? null;
}

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

const seedProjectPromises = new Map<string, Promise<AppProject[]>>();

export async function seedDefaultProjects(
  supabase: SupabaseClient,
  userId: string,
  colors: Record<string, string> = {},
): Promise<AppProject[]> {
  const inflight = seedProjectPromises.get(userId);
  if (inflight) return inflight;

  const promise = seedDefaultProjectsOnce(supabase, userId, colors).finally(() => {
    seedProjectPromises.delete(userId);
  });
  seedProjectPromises.set(userId, promise);
  return promise;
}

async function seedDefaultProjectsOnce(
  supabase: SupabaseClient,
  userId: string,
  colors: Record<string, string> = {},
): Promise<AppProject[]> {
  const existing = await fetchProjectRows(supabase, userId);
  if (existing.length > 0) {
    return existing.map(mapDbProject);
  }

  const rows = INITIAL_SEED_PROJECT_NAMES.map((name, index) => ({
    id: newUuid(),
    user_id: userId,
    name,
    accent_color: isValidHex(colors[name] ?? "")
      ? colors[name].toUpperCase()
      : name === PRIVATE_PROJECT_NAME
        ? PRIVATE_PROJECT_ACCENT
        : DEFAULT_PROJECT_ACCENT,
    sort_order: index,
  }));

  let { error } = await supabase.from("projects").insert(rows);
  if (error && isMissingColumnError(error, "accent_color")) {
    const legacyRows = rows.map(toLegacyProjectInsert);
    ({ error } = await supabase.from("projects").insert(legacyRows));
  }
  if (error) throw error;

  const seeded = await fetchProjectRows(supabase, userId);
  return seeded.map(mapDbProject);
}

async function ensurePrivateProject(
  supabase: SupabaseClient,
  userId: string,
  projects: AppProject[],
): Promise<AppProject[]> {
  if (projects.some((project) => project.name === PRIVATE_PROJECT_NAME)) {
    return projects;
  }
  const project: AppProject = {
    id: newUuid(),
    name: PRIVATE_PROJECT_NAME,
    accentColor: PRIVATE_PROJECT_ACCENT,
    sortOrder: projects.length,
  };
  await upsertProject(supabase, project, userId);
  return [...projects, project];
}

export async function fetchGyokanData(
  supabase: SupabaseClient,
  userId: string,
): Promise<GyokanData> {
  const [
    projectRows,
    caseRows,
    taskRows,
    memoRows,
    dailyMemoRows,
    dailyDiaryRows,
    lastViewDate,
  ] = await Promise.all([
    fetchProjectRows(supabase, userId),
    fetchCaseRows(supabase, userId),
    fetchTaskRows(supabase, userId),
    fetchProjectMemoRows(supabase, userId),
    fetchDailyMemoRows(supabase, userId),
    fetchDailyDiaryRows(supabase, userId),
    fetchLastViewDate(supabase, userId),
  ]);

  let projects = projectRows.map(mapDbProject);

  if (projects.length === 0) {
    const legacyColors = readLegacyColors();
    projects = await seedDefaultProjects(supabase, userId, legacyColors);
    const imported = readLegacyData();
    if (imported.hasData) {
      await importLegacyData(supabase, userId, projects, imported);
      return fetchGyokanData(supabase, userId);
    }
  }

  projects = await ensurePrivateProject(supabase, userId, projects);

  const { idToName } = buildProjectMaps(projects);
  const cases = caseRows.map((r) => mapDbCase(r, idToName));
  const caseById = Object.fromEntries(cases.map((c) => [c.id, c]));

  return {
    projects,
    tasks: taskRows.map((r) =>
      enrichTaskWithCase(mapDbTask(r, idToName), caseById),
    ),
    cases,
    memos: memoRows.map((r) => mapDbMemo(r, idToName)),
    dailyMemos: dailyMemoRows.map(mapDbDailyMemo),
    dailyDiaries: dailyDiaryRows.map(mapDbDailyDiary),
    lastViewDate,
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
      date: t.date,
      time: t.time,
      done: t.done,
      sort_order: index,
    }));
    await supabase.from("tasks").insert(rows);
  }

  if (legacy.cases.length > 0) {
    const rows = legacy.cases.map((c, index) => ({
      id: newUuid(),
      user_id: userId,
      project_id: nameToId[c.project] ?? fallbackProjectId!,
      name: c.title,
      deadline: c.deadline ?? "",
      progress: c.progress ?? 0,
      goal: c.goal ?? "",
      created_at: c.createdAt,
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

async function upsertTaskRow(
  supabase: SupabaseClient,
  row: ReturnType<typeof mapTaskToDb>,
) {
  const attempts = buildTaskUpsertAttempts(row);
  let lastError: { message?: string; code?: string } | null = null;

  for (const payload of attempts) {
    const { error } = await supabase.from("tasks").upsert(payload);
    if (!error) return;
    lastError = error;
    const retryable =
      isSchemaMismatchError(error) ||
      isMissingColumnError(error, "") ||
      (error.message?.toLowerCase().includes("null value") ?? false) ||
      (error.message?.toLowerCase().includes("not-null") ?? false) ||
      (error.message?.toLowerCase().includes("invalid input syntax") ?? false);
    if (!retryable) break;
  }

  if (lastError) throw lastError;
}

export async function upsertTask(
  supabase: SupabaseClient,
  task: AppTask,
  userId: string,
  nameToId: Record<string, string>,
  caseById: Record<string, AppCase> = {},
) {
  const row = mapTaskToDb(task, userId, nameToId, caseById);
  await upsertTaskRow(supabase, row);
}

export async function deleteTaskDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteCaseDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("cases").delete().eq("id", id);
  if (error) throw error;
}

async function upsertCaseRow(
  supabase: SupabaseClient,
  row: ReturnType<typeof mapCaseToDb>,
) {
  const attempts = [
    ...buildCaseUpsertAttempts(row),
    {
      id: row.id,
      user_id: row.user_id,
      project_id: row.project_id,
      name: row.title,
    },
  ];
  let lastError: { message?: string; code?: string } | null = null;

  for (const payload of attempts) {
    const { error } = await supabase.from("cases").upsert(payload, {
      onConflict: "id",
    });
    if (!error) {
      await syncCaseTitleAndName(supabase, row.id, row.title);
      return;
    }
    lastError = error;
    if (isAuthOrPolicyError(error)) break;
  }

  if (lastError) throw lastError;
}

async function syncCaseTitleAndName(
  supabase: SupabaseClient,
  id: string,
  title: string,
) {
  const label = title.trim() || "（無題）";
  const variants = [{ title: label, name: label }, { title: label }, { name: label }];
  for (const payload of variants) {
    const { error } = await supabase.from("cases").update(payload).eq("id", id);
    if (!error) return;
    if (isAuthOrPolicyError(error) || !isSchemaMismatchError(error)) return;
  }
}

export async function upsertCase(
  supabase: SupabaseClient,
  item: AppCase,
  userId: string,
  nameToId: Record<string, string>,
) {
  const row = mapCaseToDb(item, userId, nameToId);
  await upsertCaseRow(supabase, row);
}

export async function upsertCasesBatch(
  supabase: SupabaseClient,
  items: AppCase[],
  userId: string,
  nameToId: Record<string, string>,
) {
  if (items.length === 0) return;
  const rows = items.map((item) => mapCaseToDb(item, userId, nameToId));
  for (const row of rows) {
    await upsertCaseRow(supabase, row);
  }
}

export async function upsertTasksBatch(
  supabase: SupabaseClient,
  items: AppTask[],
  userId: string,
  nameToId: Record<string, string>,
  caseById: Record<string, AppCase> = {},
) {
  if (items.length === 0) return;
  const rows = items.map((item) => mapTaskToDb(item, userId, nameToId, caseById));
  for (const row of rows) {
    await upsertTaskRow(supabase, row);
  }
}

export async function upsertMemo(
  supabase: SupabaseClient,
  memo: AppMemo,
  userId: string,
  nameToId: Record<string, string>,
) {
  const row = mapMemoToDb(memo, userId, nameToId);
  const { error } = await supabase.from("project_memos").upsert(row);
  if (error) {
    if (isMissingTableError(error)) {
      console.warn("project_memos unavailable, memo not saved to server:", error.message);
      return;
    }
    throw error;
  }
}

export async function deleteMemoDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("project_memos").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertDailyMemo(
  supabase: SupabaseClient,
  memo: AppDailyMemo,
  userId: string,
) {
  const row = mapDailyMemoToDb(memo, userId);
  const { error } = await supabase.from("daily_memos").upsert(row);
  if (error) {
    if (isMissingTableError(error)) {
      console.warn("daily_memos unavailable, memo not saved to server:", error.message);
      return;
    }
    throw error;
  }
}

export async function deleteDailyMemoDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("daily_memos").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertDailyDiary(
  supabase: SupabaseClient,
  diary: AppDailyDiary,
  userId: string,
) {
  const row = mapDailyDiaryToDb(diary, userId);
  const { error } = await supabase.from("daily_diaries").upsert(row);
  if (error) {
    if (isMissingTableError(error)) {
      console.warn("daily_diaries unavailable, diary not saved to server:", error.message);
      return;
    }
    throw error;
  }
}

export async function deleteDailyDiaryDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("daily_diaries").delete().eq("id", id);
  if (error) throw error;
}

export async function updateProjectColor(
  supabase: SupabaseClient,
  projectId: string,
  accentColor: string,
) {
  let { error } = await supabase
    .from("projects")
    .update({ accent_color: accentColor })
    .eq("id", projectId);
  if (error && isMissingColumnError(error, "accent_color")) {
    ({ error } = await supabase
      .from("projects")
      .update({ color: accentColor })
      .eq("id", projectId));
  }
  if (error) throw error;
}

async function upsertProjectRow(
  supabase: SupabaseClient,
  row: ReturnType<typeof mapProjectToDb>,
) {
  let { error } = await supabase.from("projects").upsert(row);
  if (error && isMissingColumnError(error, "accent_color")) {
    ({ error } = await supabase.from("projects").upsert(toLegacyProjectInsert(row)));
  }
  if (error) throw error;
}

export async function upsertProject(
  supabase: SupabaseClient,
  project: AppProject,
  userId: string,
) {
  const row = mapProjectToDb(project, userId);
  await upsertProjectRow(supabase, row);
}

export async function upsertProjectsBatch(
  supabase: SupabaseClient,
  items: AppProject[],
  userId: string,
) {
  if (items.length === 0) return;
  const rows = items.map((item) => mapProjectToDb(item, userId));
  for (const row of rows) {
    await upsertProjectRow(supabase, row);
  }
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
  if (error) {
    if (isMissingTableError(error)) {
      console.warn("user_preferences unavailable:", error.message);
      return;
    }
    throw error;
  }
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
