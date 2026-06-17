"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { createClient, resetBrowserClient } from "@/lib/supabase/client";
import { ALL_PROJECTS_LABEL, DEFAULT_PROJECT_ACCENT } from "./constants";
import { buildProjectMaps, newUuid } from "./mappers";
import {
  buildCaseById,
  enrichTaskWithCase,
  normalizeTaskForStorage,
} from "./task-case";
import { parseCaseDeadlineInput } from "./date-format";
import {
  mergeRememberedTaskCompletedAt,
  normalizeTaskISODate,
  rememberTaskCompletedAt,
} from "./task-completed-at";
import {
  assignSortOrders,
  deleteMemoDb,
  deleteDailyDiaryDb,
  deleteDailyMemoDb,
  deleteTaskDb,
  deleteCaseDb,
  fetchGyokanData,
  projectsToColorMap,
  saveLastViewDate,
  updateProjectColor,
  upsertCase,
  upsertCasesBatch,
  upsertDailyDiary,
  upsertDailyMemo,
  upsertMemo,
  upsertProject,
  upsertProjectsBatch,
  upsertTask,
  upsertTasksBatch,
} from "./repository";
import {
  caseDraftDiffers,
  clearDraft,
  mergeCasesWithDrafts,
  mergeMemosWithDrafts,
  mergeTasksWithDrafts,
  memoDraftDiffers,
  readDraft,
  taskDraftDiffers,
  type CaseDraftFields,
  type MemoDraftFields,
  type TaskDraftFields,
} from "./drafts";
import {
  consolidateDailyDiariesByDate,
  consolidateDailyMemosByDate,
  dequeuePendingDailyDiary,
  dequeuePendingDailyMemo,
  mergeDailyDiariesWithPending,
  mergeDailyMemosWithPending,
  queuePendingDailyDiary,
  queuePendingDailyMemo,
  readPendingDailyDiaries,
  readPendingDailyMemos,
} from "./local-cache";
import type {
  AppCase,
  AppDailyDiary,
  AppDailyMemo,
  AppMemo,
  AppProject,
  AppTask,
} from "./types";

export type {
  AppCase as CaseItem,
  AppDailyDiary as DailyDiary,
  AppDailyMemo as DailyMemo,
  AppMemo as ProjectMemo,
  AppTask as Task,
} from "./types";

function formatLoadError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  return "データの読み込みに失敗しました";
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatCaseDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

const STATUS_OPTIONS: { label: string; tone: AppCase["statusTone"] }[] = [
  { label: "売却活動中", tone: "blue" },
  { label: "提案準備中", tone: "amber" },
  { label: "情報収集中", tone: "emerald" },
  { label: "内見調整中", tone: "violet" },
];

export function useGyokanData() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [caseSaveError, setCaseSaveError] = useState<string | null>(null);

  const [projects, setProjects] = useState<AppProject[]>([]);
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [cases, setCases] = useState<AppCase[]>([]);
  const [memos, setMemos] = useState<AppMemo[]>([]);
  const [dailyMemos, setDailyMemos] = useState<AppDailyMemo[]>([]);
  const [dailyDiaries, setDailyDiaries] = useState<AppDailyDiary[]>([]);
  const [lastViewDate, setLastViewDate] = useState<string | null>(null);

  const nameToIdRef = useRef<Record<string, string>>({});
  const casesRef = useRef<AppCase[]>([]);
  const userIdRef = useRef<string | null>(null);
  const viewDateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadDoneRef = useRef(false);

  const projectNames = useMemo(() => projects.map((p) => p.name), [projects]);
  const projectColors = useMemo(() => projectsToColorMap(projects), [projects]);
  const allProjectLabels = useMemo(
    () => [ALL_PROJECTS_LABEL, ...projectNames],
    [projectNames],
  );

  const syncMaps = useCallback((list: AppProject[]) => {
    nameToIdRef.current = buildProjectMaps(list).nameToId;
  }, []);

  const flushPendingDrafts = useCallback(async (
    serverCases: AppCase[],
    serverTasks: AppTask[],
    serverMemos: AppMemo[],
  ) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const nameToId = nameToIdRef.current;
    const supabase = getSupabase();

    for (const item of serverCases) {
      const draft = readDraft<CaseDraftFields>("case", item.id);
      if (!draft || !caseDraftDiffers(item, draft)) continue;
      const merged: AppCase = {
        ...item,
        title: draft.title,
        project: draft.project,
        goal: draft.goal,
        status: draft.status,
        statusTone: draft.statusTone,
        deadline: parseCaseDeadlineInput(draft.deadline),
      };
      try {
        await upsertCase(supabase, merged, uid, nameToId);
        clearDraft("case", item.id);
      } catch (err) {
        console.error("Failed to flush case draft", err);
      }
    }

    for (const item of serverTasks) {
      const draft = readDraft<TaskDraftFields>("task", item.id);
      if (!draft || !taskDraftDiffers(item, draft)) continue;
      const dateEnd =
        draft.useRange && draft.dateEnd && draft.dateEnd !== draft.date
          ? draft.dateEnd
          : undefined;
      const merged = enrichTaskWithCase(
        {
          ...item,
          title: draft.title,
          caseId: draft.caseId || item.caseId,
          date: draft.date,
          dateEnd,
        },
        buildCaseById(casesRef.current),
      );
      try {
        await upsertTask(supabase, merged, uid, nameToId, buildCaseById(casesRef.current));
        clearDraft("task", item.id);
      } catch (err) {
        console.error("Failed to flush task draft", err);
      }
    }

    for (const item of serverMemos) {
      const draft = readDraft<MemoDraftFields>("memo", item.id);
      if (!draft || !memoDraftDiffers(item, draft)) continue;
      const merged: AppMemo = {
        ...item,
        date: draft.date,
        body: draft.body,
      };
      try {
        await upsertMemo(supabase, merged, uid, nameToId);
        clearDraft("memo", item.id);
      } catch (err) {
        console.error("Failed to flush memo draft", err);
      }
    }
  }, [getSupabase]);

  const flushPendingDailyMemos = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    const pending = readPendingDailyMemos();
    if (pending.length === 0) return;
    for (const memo of pending) {
      try {
        await upsertDailyMemo(getSupabase(), memo, uid);
        dequeuePendingDailyMemo(memo.id);
      } catch (err) {
        console.error("Failed to flush pending daily memo", err);
      }
    }
  }, [getSupabase]);

  const flushPendingDailyDiaries = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    const pending = readPendingDailyDiaries();
    if (pending.length === 0) return;
    for (const diary of pending) {
      try {
        await upsertDailyDiary(getSupabase(), diary, uid);
        dequeuePendingDailyDiary(diary.id);
      } catch (err) {
        console.error("Failed to flush pending daily diary", err);
      }
    }
  }, [getSupabase]);

  const syncConsolidatedDailyMemos = useCallback(async (
    before: AppDailyMemo[],
    after: AppDailyMemo[],
  ) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const keepIds = new Set(after.map((m) => m.id));
    const supabase = getSupabase();
    for (const memo of after) {
      const previous = before.find((m) => m.id === memo.id);
      if (!previous || previous.body !== memo.body) {
        await upsertDailyMemo(supabase, memo, uid);
      }
    }
    for (const memo of before) {
      if (!keepIds.has(memo.id)) {
        await deleteDailyMemoDb(supabase, memo.id);
        dequeuePendingDailyMemo(memo.id);
      }
    }
  }, [getSupabase]);

  const syncConsolidatedDailyDiaries = useCallback(async (
    before: AppDailyDiary[],
    after: AppDailyDiary[],
  ) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const keepIds = new Set(after.map((d) => d.id));
    const supabase = getSupabase();
    for (const diary of after) {
      const previous = before.find((d) => d.id === diary.id);
      if (!previous || previous.body !== diary.body) {
        await upsertDailyDiary(supabase, diary, uid);
      }
    }
    for (const diary of before) {
      if (!keepIds.has(diary.id)) {
        await deleteDailyDiaryDb(supabase, diary.id);
        dequeuePendingDailyDiary(diary.id);
      }
    }
  }, [getSupabase]);

  const loadData = useCallback(async (uid: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? initialLoadDoneRef.current;
    if (!silent) {
      setDataReady(false);
    }
    setLoadError(null);
    try {
      const data = await fetchGyokanData(getSupabase(), uid);
      setProjects(data.projects);
      syncMaps(data.projects);
      const mergedCases = mergeCasesWithDrafts(data.cases);
      setCases(mergedCases);
      casesRef.current = mergedCases;
      setTasks(
        mergeTasksWithDrafts(data.tasks, mergedCases).map(mergeRememberedTaskCompletedAt),
      );
      setMemos(mergeMemosWithDrafts(data.memos));
      const mergedDailyMemos = mergeDailyMemosWithPending(data.dailyMemos);
      const consolidatedDailyMemos = consolidateDailyMemosByDate(mergedDailyMemos);
      setDailyMemos(consolidatedDailyMemos);
      const mergedDailyDiaries = mergeDailyDiariesWithPending(data.dailyDiaries);
      const consolidatedDailyDiaries = consolidateDailyDiariesByDate(mergedDailyDiaries);
      setDailyDiaries(consolidatedDailyDiaries);
      setLastViewDate(data.lastViewDate);
      setLoadError(null);
      setDataReady(true);
      initialLoadDoneRef.current = true;
      if (consolidatedDailyMemos.length < mergedDailyMemos.length) {
        void syncConsolidatedDailyMemos(mergedDailyMemos, consolidatedDailyMemos);
      }
      if (consolidatedDailyDiaries.length < mergedDailyDiaries.length) {
        void syncConsolidatedDailyDiaries(mergedDailyDiaries, consolidatedDailyDiaries);
      }
      void flushPendingDrafts(data.cases, data.tasks, data.memos);
      void flushPendingDailyMemos();
      void flushPendingDailyDiaries();
      return data.lastViewDate;
    } catch (err) {
      const message = formatLoadError(err);
      setLoadError(message);
      setDataReady(true);
      initialLoadDoneRef.current = true;
      return null;
    }
  }, [getSupabase, syncMaps, flushPendingDrafts, flushPendingDailyMemos, syncConsolidatedDailyMemos]);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabase();

    // Do not call getSession() here — running it alongside onAuthStateChange and
    // then issuing Supabase queries from the callback can deadlock auth (issue #762).
    const scheduleLoad = (uid: string, silent: boolean) => {
      window.setTimeout(() => {
        if (!mounted) return;
        void loadData(uid, { silent });
      }, 0);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      userIdRef.current = u?.id ?? null;
      setAuthChecked(true);
      setAuthReady(true);

      if (!u) {
        setProjects([]);
        setTasks([]);
        setCases([]);
        setMemos([]);
        setDailyMemos([]);
        setDataReady(false);
        initialLoadDoneRef.current = false;
        return;
      }

      const silent =
        event !== "INITIAL_SESSION" && initialLoadDoneRef.current;
      scheduleLoad(u.id, silent);
      },
    );

    const authFallback = window.setTimeout(() => {
      if (!mounted) return;
      setAuthChecked(true);
      setAuthReady(true);
    }, 8000);

    return () => {
      mounted = false;
      window.clearTimeout(authFallback);
      subscription.unsubscribe();
    };
  }, [getSupabase, loadData]);

  const persistTask = useCallback(async (task: AppTask): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;
    const normalized = normalizeTaskForStorage(
      enrichTaskWithCase(task, buildCaseById(casesRef.current)),
    );
    try {
      await upsertTask(
        getSupabase(),
        normalized,
        uid,
        nameToIdRef.current,
        buildCaseById(casesRef.current),
      );
      clearDraft("task", task.id);
      return true;
    } catch (err) {
      console.error("Failed to save task", err);
      return false;
    }
  }, [getSupabase]);

  const persistTasks = useCallback(async (list: AppTask[]) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertTasksBatch(
        getSupabase(),
        list,
        uid,
        nameToIdRef.current,
        buildCaseById(casesRef.current),
      );
    } catch (err) {
      console.error("Failed to save tasks", err);
    }
  }, [getSupabase]);

  const persistCase = useCallback(async (item: AppCase): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;
    try {
      await upsertCase(getSupabase(), item, uid, nameToIdRef.current);
      clearDraft("case", item.id);
      return true;
    } catch (err) {
      console.error("Failed to save case", err);
      return false;
    }
  }, [getSupabase]);

  const persistCases = useCallback(async (list: AppCase[]) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertCasesBatch(getSupabase(), list, uid, nameToIdRef.current);
    } catch (err) {
      console.error("Failed to save cases", err);
    }
  }, [getSupabase]);

  const persistDailyMemo = useCallback(async (memo: AppDailyMemo): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;
    try {
      await upsertDailyMemo(getSupabase(), memo, uid);
      dequeuePendingDailyMemo(memo.id);
      return true;
    } catch (err) {
      console.error("Failed to save daily memo", err);
      queuePendingDailyMemo(memo);
      return false;
    }
  }, [getSupabase]);

  const persistMemo = useCallback(async (memo: AppMemo): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;
    try {
      await upsertMemo(getSupabase(), memo, uid, nameToIdRef.current);
      clearDraft("memo", memo.id);
      return true;
    } catch (err) {
      console.error("Failed to save memo", err);
      return false;
    }
  }, [getSupabase]);

  const persistProjects = useCallback(async (list: AppProject[]) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertProjectsBatch(getSupabase(), list, uid);
    } catch (err) {
      console.error("Failed to save projects", err);
    }
  }, [getSupabase]);

  const setProjectColor = useCallback(async (projectName: string, accent: string) => {
    const projectId = nameToIdRef.current[projectName];
    if (!projectId) return;
    setProjects((prev) =>
      prev.map((p) =>
        p.name === projectName ? { ...p, accentColor: accent.toUpperCase() } : p,
      ),
    );
    try {
      await updateProjectColor(getSupabase(), projectId, accent.toUpperCase());
    } catch (err) {
      console.error("Failed to save project color", err);
    }
  }, [getSupabase]);

  const saveViewDate = useCallback((date: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (viewDateSaveTimer.current) clearTimeout(viewDateSaveTimer.current);
    viewDateSaveTimer.current = setTimeout(() => {
      void saveLastViewDate(getSupabase(), uid, date);
    }, 500);
  }, [getSupabase]);

  const signInWithGoogle = useCallback(async () => {
    await getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: getAuthCallbackUrl() },
    });
  }, [getSupabase]);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut({ scope: "global" });
    resetBrowserClient();
    window.location.href = "/login";
  }, [getSupabase]);

  const addProject = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return false;

    const uid = userIdRef.current;
    if (!uid) return false;

    let added = false;
    setProjects((prev) => {
      if (prev.some((p) => p.name === trimmed)) return prev;
      const project: AppProject = {
        id: newUuid(),
        name: trimmed,
        accentColor: DEFAULT_PROJECT_ACCENT,
        sortOrder: prev.length,
      };
      added = true;
      const next = [...prev, project];
      syncMaps(next);
      void upsertProject(getSupabase(), project, uid);
      return next;
    });
    return added;
  }, [getSupabase, syncMaps]);

  const replaceProjects = useCallback((updater: (prev: AppProject[]) => AppProject[]) => {
    setProjects((prev) => {
      const next = assignSortOrders(updater(prev));
      syncMaps(next);
      void persistProjects(next);
      return next;
    });
  }, [persistProjects, syncMaps]);

  const addTask = useCallback(
    (data: {
      title: string;
      time: string;
      date: string;
      dateEnd?: string;
      project: string;
      caseId?: string;
    }) => {
    const caseById = buildCaseById(casesRef.current);
    const caseId = data.caseId?.trim() || undefined;
    const linked = caseId ? caseById[caseId] : undefined;
    const project = (linked?.project ?? data.project ?? "").trim();

    const task = normalizeTaskForStorage(
      enrichTaskWithCase(
        {
          id: newUuid(),
          title: data.title.trim(),
          time: data.time,
          date: data.date,
          dateEnd: data.dateEnd,
          done: false,
          project,
          caseId,
          sortOrder: 0,
        },
        caseById,
      ),
    );
    setTasks((prev) => {
      const next = assignSortOrders([task, ...prev]);
      void persistTask(task);
      return next;
    });
  }, [persistTask]);

  const updateTask = useCallback((
    id: string,
    patch: Partial<AppTask> & { title: string; caseId?: string; date: string; dateEnd?: string },
  ) => {
    setTasks((prev) => {
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        return enrichTaskWithCase({ ...t, ...patch }, buildCaseById(casesRef.current));
      });
      const updated = next.find((t) => t.id === id);
      if (updated) void persistTask(updated);
      return next;
    });
  }, [persistTask]);

  const toggleTask = useCallback((id: string, completedOn?: string) => {
    setTasks((prev) => {
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const done = !t.done;
        const completedAt = done
          ? normalizeTaskISODate(completedOn ?? t.date)
          : null;
        rememberTaskCompletedAt(id, completedAt);
        return {
          ...t,
          done,
          completedAt,
        };
      });
      const updated = next.find((t) => t.id === id);
      if (updated) void persistTask(updated);
      return next;
    });
  }, [persistTask]);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    void deleteTaskDb(getSupabase(), id);
  }, [getSupabase]);

  const replaceTasks = useCallback((updater: (prev: AppTask[]) => AppTask[]) => {
    setTasks((prev) => {
      const next = assignSortOrders(updater(prev));
      void persistTasks(next);
      return next;
    });
  }, [persistTasks]);

  const addCase = useCallback((data: { title: string; project: string }) => {
    const status = STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)];
    const item: AppCase = {
      id: newUuid(),
      title: data.title,
      project: data.project,
      status: status.label,
      statusTone: status.tone,
      deadline: "",
      progress: 10,
      goal: "",
      subtasksDone: 0,
      subtasksTotal: 5,
      comments: 0,
      done: false,
      createdAt: formatCaseDate(new Date()),
      completedAt: null,
      sortOrder: 0,
    };
    setCases((prev) => {
      const next = assignSortOrders([item, ...prev]);
      casesRef.current = next;
      const toSave = next.find((c) => c.id === item.id) ?? item;
      void persistCase(toSave);
      return next;
    });
  }, [persistCase]);

  const updateCase = useCallback((
    id: string,
    data: {
      title: string;
      project: string;
      goal: string;
      status: string;
      statusTone: AppCase["statusTone"];
      deadline: string;
    },
  ): Promise<boolean> => {
    let updated: AppCase | undefined;
    setCases((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...data } : c));
      updated = next.find((c) => c.id === id);
      casesRef.current = next;
      return next;
    });
    if (!updated) return Promise.resolve(false);
    return persistCase(updated);
  }, [persistCase]);

  const toggleCase = useCallback((id: string) => {
    setCases((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const done = !c.done;
        return {
          ...c,
          done,
          completedAt: done ? formatCaseDate(new Date()) : null,
        };
      });
      const updated = next.find((c) => c.id === id);
      if (updated) void persistCase(updated);
      casesRef.current = next;
      return next;
    });
  }, [persistCase]);

  const deleteCase = useCallback((id: string) => {
    clearDraft("case", id);
    setCases((prev) => {
      const next = prev.filter((c) => c.id !== id);
      casesRef.current = next;
      return next;
    });
    setTasks((prev) => {
      const next = prev.map((t) =>
        t.caseId === id ? { ...t, caseId: undefined } : t,
      );
      void persistTasks(next);
      return next;
    });
    void deleteCaseDb(getSupabase(), id);
  }, [getSupabase, persistTasks]);

  const replaceCases = useCallback((updater: (prev: AppCase[]) => AppCase[]) => {
    setCases((prev) => {
      const next = assignSortOrders(updater(prev));
      casesRef.current = next;
      void persistCases(next);
      return next;
    });
  }, [persistCases]);

  const saveProjectMemo = useCallback((data: { id?: string; project: string; date: string; body: string }) => {
    if (data.id) {
      setMemos((prev) => {
        const next = prev.map((m) =>
          m.id === data.id ? { ...m, date: data.date, body: data.body } : m,
        );
        const updated = next.find((m) => m.id === data.id);
        if (updated) void persistMemo(updated);
        return next;
      });
      return;
    }
    const memo: AppMemo = {
      id: newUuid(),
      project: data.project,
      date: data.date,
      body: data.body,
    };
    setMemos((prev) => [memo, ...prev]);
    void persistMemo(memo);
  }, [persistMemo]);

  const deleteProjectMemo = useCallback((id: string) => {
    setMemos((prev) => prev.filter((m) => m.id !== id));
    void deleteMemoDb(getSupabase(), id);
  }, [getSupabase]);

  const saveDailyMemo = useCallback(async (date: string, body: string): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;

    const supabase = getSupabase();
    let memoToPersist: AppDailyMemo | null = null;
    let memosToDelete: string[] = [];
    let skipped = false;

    setDailyMemos((prev) => {
      const sameDay = prev
        .filter((m) => m.date === date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const primary = sameDay[0];

      if (primary) {
        if (!body.trim()) {
          memosToDelete = sameDay.map((m) => m.id);
          return prev.filter((m) => m.date !== date);
        }

        memoToPersist = { ...primary, body };
        memosToDelete = sameDay.slice(1).map((m) => m.id);
        return [...prev.filter((m) => m.date !== date), memoToPersist];
      }

      if (!body.trim()) {
        skipped = true;
        return prev;
      }

      memoToPersist = {
        id: newUuid(),
        date,
        body,
        createdAt: new Date().toISOString(),
      };
      return [...prev, memoToPersist];
    });

    if (skipped) return true;

    try {
      for (const id of memosToDelete) {
        await deleteDailyMemoDb(supabase, id);
        dequeuePendingDailyMemo(id);
      }
      if (!memoToPersist) return true;
      return persistDailyMemo(memoToPersist);
    } catch (err) {
      console.error("Failed to save daily memo", err);
      if (memoToPersist) queuePendingDailyMemo(memoToPersist);
      return false;
    }
  }, [getSupabase, persistDailyMemo]);

  const deleteDailyMemo = useCallback((id: string) => {
    setDailyMemos((prev) => prev.filter((m) => m.id !== id));
    void deleteDailyMemoDb(getSupabase(), id);
  }, [getSupabase]);

  const persistDailyDiary = useCallback(async (diary: AppDailyDiary): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;
    try {
      await upsertDailyDiary(getSupabase(), diary, uid);
      dequeuePendingDailyDiary(diary.id);
      return true;
    } catch (err) {
      console.error("Failed to save daily diary", err);
      return false;
    }
  }, [getSupabase]);

  const saveDailyDiary = useCallback(async (date: string, body: string): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;

    const supabase = getSupabase();
    let diaryToPersist: AppDailyDiary | null = null;
    let diariesToDelete: string[] = [];
    let skipped = false;

    setDailyDiaries((prev) => {
      const sameDay = prev
        .filter((d) => d.date === date)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      const primary = sameDay[0];

      if (primary) {
        if (!body.trim()) {
          diariesToDelete = sameDay.map((d) => d.id);
          return prev.filter((d) => d.date !== date);
        }

        diaryToPersist = { ...primary, body };
        diariesToDelete = sameDay.slice(1).map((d) => d.id);
        return [...prev.filter((d) => d.date !== date), diaryToPersist];
      }

      if (!body.trim()) {
        skipped = true;
        return prev;
      }

      diaryToPersist = {
        id: newUuid(),
        date,
        body,
        createdAt: new Date().toISOString(),
      };
      return [...prev, diaryToPersist];
    });

    if (skipped) return true;

    try {
      for (const id of diariesToDelete) {
        await deleteDailyDiaryDb(supabase, id);
        dequeuePendingDailyDiary(id);
      }
      if (!diaryToPersist) return true;
      return persistDailyDiary(diaryToPersist);
    } catch (err) {
      console.error("Failed to save daily diary", err);
      if (diaryToPersist) queuePendingDailyDiary(diaryToPersist);
      return false;
    }
  }, [getSupabase, persistDailyDiary]);

  const deleteDailyDiary = useCallback((id: string) => {
    setDailyDiaries((prev) => prev.filter((d) => d.id !== id));
    void deleteDailyDiaryDb(getSupabase(), id);
  }, [getSupabase]);

  return {
    user,
    authReady,
    authChecked,
    dataReady,
    loadError,
    caseSaveError,
    projects,
    projectNames,
    projectColors,
    allProjectLabels,
    tasks,
    cases,
    memos,
    dailyMemos,
    dailyDiaries,
    lastViewDate,
    setProjectColor,
    addProject,
    replaceProjects,
    saveViewDate,
    signInWithGoogle,
    signOut,
    addTask,
    updateTask,
    toggleTask,
    deleteTask,
    replaceTasks,
    addCase,
    updateCase,
    toggleCase,
    deleteCase,
    replaceCases,
    saveProjectMemo,
    deleteProjectMemo,
    saveDailyMemo,
    deleteDailyMemo,
    saveDailyDiary,
    deleteDailyDiary,
    reload: () => {
      const uid = userIdRef.current;
      if (uid) return loadData(uid, { silent: true });
      return Promise.resolve(null);
    },
  };
}

export { ALL_PROJECTS_LABEL } from "./constants";
