"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { createClient } from "@/lib/supabase/client";
import { ALL_PROJECTS_LABEL, DEFAULT_PROJECT_ACCENT } from "./constants";
import { buildProjectMaps, newUuid } from "./mappers";
import {
  assignSortOrders,
  deleteMemoDb,
  deleteTaskDb,
  fetchGyokanData,
  projectsToColorMap,
  saveLastViewDate,
  updateProjectColor,
  upsertCase,
  upsertCasesBatch,
  upsertMemo,
  upsertProject,
  upsertProjectsBatch,
  upsertTask,
  upsertTasksBatch,
} from "./repository";
import type { AppCase, AppMemo, AppProject, AppTask } from "./types";

export type { AppCase as CaseItem, AppMemo as ProjectMemo, AppTask as Task } from "./types";

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
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [projects, setProjects] = useState<AppProject[]>([]);
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [cases, setCases] = useState<AppCase[]>([]);
  const [memos, setMemos] = useState<AppMemo[]>([]);
  const [lastViewDate, setLastViewDate] = useState<string | null>(null);

  const nameToIdRef = useRef<Record<string, string>>({});
  const userIdRef = useRef<string | null>(null);
  const viewDateSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const projectNames = useMemo(() => projects.map((p) => p.name), [projects]);
  const projectColors = useMemo(() => projectsToColorMap(projects), [projects]);
  const allProjectLabels = useMemo(
    () => [ALL_PROJECTS_LABEL, ...projectNames],
    [projectNames],
  );

  const syncMaps = useCallback((list: AppProject[]) => {
    nameToIdRef.current = buildProjectMaps(list).nameToId;
  }, []);

  const loadData = useCallback(async (uid: string) => {
    setDataReady(false);
    setLoadError(null);
    try {
      const data = await fetchGyokanData(getSupabase(), uid);
      setProjects(data.projects);
      syncMaps(data.projects);
      setTasks(data.tasks);
      setCases(data.cases);
      setMemos(data.memos);
      setLastViewDate(data.lastViewDate);
      setDataReady(true);
      return data.lastViewDate;
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "データの読み込みに失敗しました");
      setDataReady(true);
      return null;
    }
  }, [getSupabase, syncMaps]);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      const u = session?.user ?? null;
      setUser(u);
      userIdRef.current = u?.id ?? null;
      setAuthReady(true);
      if (u) void loadData(u.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      userIdRef.current = u?.id ?? null;
      if (u) {
        void loadData(u.id);
      } else {
        setProjects([]);
        setTasks([]);
        setCases([]);
        setMemos([]);
        setDataReady(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [getSupabase, loadData]);

  const persistTask = useCallback(async (task: AppTask) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertTask(getSupabase(), task, uid, nameToIdRef.current);
    } catch (err) {
      console.error("Failed to save task", err);
    }
  }, [getSupabase]);

  const persistTasks = useCallback(async (list: AppTask[]) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertTasksBatch(getSupabase(), list, uid, nameToIdRef.current);
    } catch (err) {
      console.error("Failed to save tasks", err);
    }
  }, [getSupabase]);

  const persistCase = useCallback(async (item: AppCase) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertCase(getSupabase(), item, uid, nameToIdRef.current);
    } catch (err) {
      console.error("Failed to save case", err);
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

  const persistMemo = useCallback(async (memo: AppMemo) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertMemo(getSupabase(), memo, uid, nameToIdRef.current);
    } catch (err) {
      console.error("Failed to save memo", err);
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
    await getSupabase().auth.signOut();
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

  const addTask = useCallback((data: { title: string; project: string; time: string; date: string }) => {
    const task: AppTask = {
      id: newUuid(),
      title: data.title,
      time: data.time.includes("今日") ? data.time : `今日 ${data.time}`,
      date: data.date,
      done: false,
      project: data.project,
      sortOrder: 0,
    };
    setTasks((prev) => {
      const next = assignSortOrders([task, ...prev]);
      void persistTasks(next);
      return next;
    });
  }, [persistTasks]);

  const updateTask = useCallback((id: string, patch: Partial<AppTask> & { title: string; project: string; date: string; dateEnd?: string }) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, ...patch } : t));
      const updated = next.find((t) => t.id === id);
      if (updated) void persistTask(updated);
      return next;
    });
  }, [persistTask]);

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => {
      const next = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
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
      void persistCase(item);
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
  ) => {
    setCases((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, ...data } : c));
      const updated = next.find((c) => c.id === id);
      if (updated) void persistCase(updated);
      return next;
    });
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
      return next;
    });
  }, [persistCase]);

  const replaceCases = useCallback((updater: (prev: AppCase[]) => AppCase[]) => {
    setCases((prev) => {
      const next = assignSortOrders(updater(prev));
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

  return {
    user,
    authReady,
    dataReady,
    loadError,
    projects,
    projectNames,
    projectColors,
    allProjectLabels,
    tasks,
    cases,
    memos,
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
    replaceCases,
    saveProjectMemo,
    deleteProjectMemo,
    reload: () => {
      const uid = userIdRef.current;
      if (uid) return loadData(uid);
      return Promise.resolve(null);
    },
  };
}

export { ALL_PROJECTS_LABEL } from "./constants";
