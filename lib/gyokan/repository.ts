import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_PROJECT_ACCENT, DEFAULT_PROJECT_NAMES, LEGACY_STORAGE_KEYS, PRIVATE_PROJECT_ACCENT, PRIVATE_PROJECT_NAME, INITIAL_SEED_PROJECT_NAMES } from "./constants";
import {
  buildProjectMaps,
  mapCaseToDb,
  mapDbCase,
  mapDbDailyDiary,
  mapDbDailyMemo,
  mapDbEvent,
  mapDbMemo,
  mapDbProject,
  mapDbTask,
  mapDailyDiaryToDb,
  mapDailyMemoToDb,
  mapEventToDb,
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
} from "./schema-compat";
import { enrichTaskWithCase } from "./task-case";
import { modePreferencesFromRow, modePreferencesToRow } from "./mode-preferences";
import type {
  AppCase,
  AppDailyDiary,
  AppDailyMemo,
  AppEvent,
  AppMemo,
  AppProject,
  AppTask,
  DbCase,
  DbDailyDiary,
  DbDailyMemo,
  DbEvent,
  DbMemo,
  DbProject,
  DbTask,
  GyokanData,
  ModePreferences,
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

async function fetchUserPreferences(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ lastViewDate: string | null; modePreferences: ModePreferences | null }> {
  const res = await supabase
    .from("user_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (res.error) {
    if (isMissingTableError(res.error)) {
      console.warn("user_preferences unavailable (run migration if needed):", res.error.message);
      return { lastViewDate: null, modePreferences: null };
    }
    throw res.error;
  }
  const row = res.data as Record<string, unknown> | null;
  return {
    lastViewDate: (row?.last_view_date as string | null | undefined) ?? null,
    // null when the mode columns aren't there yet — the caller falls back.
    modePreferences: modePreferencesFromRow(row),
  };
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
    preferences,
  ] = await Promise.all([
    fetchProjectRows(supabase, userId),
    fetchCaseRows(supabase, userId),
    fetchTaskRows(supabase, userId),
    fetchProjectMemoRows(supabase, userId),
    fetchDailyMemoRows(supabase, userId),
    fetchDailyDiaryRows(supabase, userId),
    fetchUserPreferences(supabase, userId),
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
    lastViewDate: preferences.lastViewDate,
    modePreferences: preferences.modePreferences,
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
      await syncCaseDone(supabase, row.id, row.done, row.completed_at);
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

async function syncCaseDone(
  supabase: SupabaseClient,
  id: string,
  done: boolean,
  completedAt: string | null,
) {
  const { error } = await supabase
    .from("cases")
    .update({ done, completed_at: completedAt })
    .eq("id", id);
  if (error && !isSchemaMismatchError(error) && !isMissingColumnError(error, "done")) {
    console.warn("syncCaseDone failed:", error.message);
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

  // One request per payload shape rather than one per row: moving a single
  // task can shift the sort_order of many others, and saving those one at a
  // time took long enough that a reload would cut the save off midway.
  // Rows are grouped by their exact key set so a bulk upsert never turns a
  // column one row omits into an explicit null.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const shape = Object.keys(row).sort().join(",");
    groups.set(shape, [...(groups.get(shape) ?? []), row]);
  }

  for (const group of groups.values()) {
    const { error } = await supabase.from("tasks").upsert(group);
    if (!error) continue;
    if (isAuthOrPolicyError(error)) throw error;
    // The per-row path knows how to step down to older schemas.
    for (const row of group) {
      await upsertTaskRow(supabase, row);
    }
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

/**
 * Saves the mode settings into the user's user_preferences row, touching
 * only those columns (last_view_date etc. are left as they are). Throws when
 * the save fails — including when the columns don't exist yet because
 * 20261012_add_mode_preferences.sql hasn't been run; the message then says so.
 */
export async function saveModePreferences(
  supabase: SupabaseClient,
  userId: string,
  prefs: ModePreferences,
) {
  const { error } = await supabase.from("user_preferences").upsert({
    user_id: userId,
    ...modePreferencesToRow(prefs),
  });
  if (!error) return;
  if (isMissingTableError(error) || isSchemaMismatchError(error)) {
    throw new Error(
      "サーバーに保存する列がまだありません(マイグレーション 20261012_add_mode_preferences.sql が未実行です)。この端末では設定が反映されています。",
    );
  }
  throw error;
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

/**
 * My events plus my family's shared private events. No user_id filter: RLS
 * (events_select_household) returns exactly what I may see — my own rows,
 * and other household members' scope='private' / visibility='shared' rows.
 */
async function fetchEventRows(supabase: SupabaseClient): Promise<DbEvent[]> {
  const res = await supabase
    .from("events")
    .select("*")
    .order("sort_order");
  if (res.error) {
    if (isMissingTableError(res.error)) {
      console.warn("events unavailable (run migration if needed):", res.error.message);
      return [];
    }
    throw res.error;
  }
  return (res.data as DbEvent[] | null) ?? [];
}

export async function fetchGyokanEvents(supabase: SupabaseClient): Promise<AppEvent[]> {
  const rows = await fetchEventRows(supabase);
  return rows.map(mapDbEvent);
}

/** An event written by someone else in my household (not by me). */
export function isFamilyEvent(event: Pick<AppEvent, "userId">, myUserId: string) {
  return !!event.userId && event.userId !== myUserId;
}

/** Shown when a family member's event can't be saved because it is gone. */
export const EVENT_GONE_MESSAGE =
  "この予定は、作成した家族が削除したか「自分だけ」に変更したため、保存できませんでした。";

const VISIBILITY_MIGRATION_MESSAGE =
  "「自分だけ」を保存するには、データベースの更新(マイグレーション 20261018_event_visibility_and_history.sql)が必要です。";

/** Drops `scope`/`color`/`visibility` from an events row — used when the DB
 * doesn't have those columns yet (migrations 20260921_add_scope_columns.sql /
 * 20260927_add_event_color.sql / 20261018_event_visibility_and_history.sql
 * not applied). Stripping them together on any schema-mismatch error keeps the
 * retry simple regardless of which one is actually missing. A 自分だけ event
 * is never saved this way: without the column it would be visible to the
 * family, so that save fails instead. */
function withoutEventCompatColumns<T extends { scope?: unknown; color?: unknown; visibility?: unknown }>(
  row: T,
): Omit<T, "scope" | "color" | "visibility"> {
  if (row.visibility === "only_me") throw new Error(VISIBILITY_MIGRATION_MESSAGE);
  const { scope: _scope, color: _color, visibility: _visibility, ...rest } = row;
  return rest;
}

function isEventCompatError(error: { message?: string; code?: string }) {
  return (
    isMissingColumnError(error, "scope") ||
    isMissingColumnError(error, "color") ||
    isMissingColumnError(error, "visibility") ||
    isSchemaMismatchError(error)
  );
}

/** Saves one of my own events (insert or update). */
export async function upsertEvent(
  supabase: SupabaseClient,
  event: AppEvent,
  userId: string,
) {
  const row = mapEventToDb(event, userId);
  const { error } = await supabase.from("events").upsert(row);
  if (!error) return;
  if (isEventCompatError(error)) {
    const { error: retryError } = await supabase.from("events").upsert(withoutEventCompatColumns(row));
    if (!retryError) return;
    throw retryError;
  }
  throw error;
}

/**
 * Saves an edit to a family member's event. An update, never an upsert: if
 * the event was deleted or made 自分だけ meanwhile, an upsert would re-create
 * it as mine. user_id / scope / visibility are not sent — only the creator may
 * change them (the DB keeps them in any case, see events_keep_creator).
 * Throws EVENT_GONE_MESSAGE when no row was updated.
 */
export async function updateFamilyEvent(supabase: SupabaseClient, event: AppEvent) {
  const { id, user_id: _userId, scope: _scope, visibility: _visibility, ...fields } = mapEventToDb(event, "");
  const res = await supabase.from("events").update(fields).eq("id", id).select("id");
  if (res.error) {
    if (!isEventCompatError(res.error)) throw res.error;
    const { color: _color, ...withoutColor } = fields;
    const retry = await supabase.from("events").update(withoutColor).eq("id", id).select("id");
    if (retry.error) throw retry.error;
    if ((retry.data ?? []).length === 0) throw new Error(EVENT_GONE_MESSAGE);
    return;
  }
  if ((res.data ?? []).length === 0) throw new Error(EVENT_GONE_MESSAGE);
}

/**
 * Saves new sort orders after a reorder, for my events and my family's alike.
 * Uses set_event_sort_orders (an UPDATE under RLS: an event deleted or hidden
 * meanwhile is skipped, never re-created). Before the stage 3 migration, falls
 * back to upserting my own events only.
 */
export async function saveEventSortOrders(
  supabase: SupabaseClient,
  items: AppEvent[],
  userId: string,
) {
  if (items.length === 0) return;
  const { error } = await supabase.rpc("set_event_sort_orders", {
    p_ids: items.map((item) => item.id),
    p_orders: items.map((item) => item.sortOrder),
  });
  if (!error) return;
  const missingFunction =
    error.code === "PGRST202" || (error.message?.includes("Could not find the function") ?? false);
  if (!missingFunction) throw error;
  await upsertEventsBatch(
    supabase,
    items.filter((item) => !isFamilyEvent(item, userId)),
    userId,
  );
}

export async function upsertEventsBatch(
  supabase: SupabaseClient,
  items: AppEvent[],
  userId: string,
) {
  if (items.length === 0) return;
  const rows = items.map((item) => mapEventToDb(item, userId));
  const { error } = await supabase.from("events").upsert(rows);
  if (!error) return;
  if (isEventCompatError(error)) {
    const { error: retryError } = await supabase.from("events").upsert(rows.map(withoutEventCompatColumns));
    if (!retryError) return;
    throw retryError;
  }
  throw error;
}

/** One edit or delete of an event (table event_history, written by a DB trigger). */
export type EventHistoryEntry = {
  id: number;
  action: "update" | "delete";
  changedBy: string | null;
  changedAt: string;
  changedFields: string[];
};

export const EVENT_HISTORY_LIMIT = 10;

/**
 * The latest edits of an event, newest first. RLS returns only what I may
 * see. Empty when the table doesn't exist yet (migration not applied).
 */
export async function fetchEventHistory(
  supabase: SupabaseClient,
  eventId: string,
): Promise<EventHistoryEntry[]> {
  const res = await supabase
    .from("event_history")
    .select("id, action, changed_by, changed_at, changed_fields")
    .eq("event_id", eventId)
    .order("changed_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(EVENT_HISTORY_LIMIT);
  if (res.error) {
    if (isMissingTableError(res.error)) return [];
    throw res.error;
  }
  return ((res.data ?? []) as {
    id: number;
    action: "update" | "delete";
    changed_by: string | null;
    changed_at: string;
    changed_fields: string[] | null;
  }[]).map((row) => ({
    id: row.id,
    action: row.action,
    changedBy: row.changed_by,
    changedAt: row.changed_at,
    changedFields: row.changed_fields ?? [],
  }));
}

export async function deleteEventDb(supabase: SupabaseClient, id: string) {
  const { error } = await supabase.from("events").delete().eq("id", id);
  if (error) throw error;
}
