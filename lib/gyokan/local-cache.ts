import type { AppDailyDiary, AppDailyMemo } from "./types";

const PENDING_DAILY_MEMOS_KEY = "gyokan-pending-daily-memos-v1";
const PENDING_DAILY_DIARIES_KEY = "gyokan-pending-daily-diaries-v1";

export function readPendingDailyMemos(): AppDailyMemo[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_DAILY_MEMOS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppDailyMemo[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePendingDailyMemos(memos: AppDailyMemo[]) {
  if (typeof window === "undefined") return;
  try {
    if (memos.length === 0) {
      localStorage.removeItem(PENDING_DAILY_MEMOS_KEY);
    } else {
      localStorage.setItem(PENDING_DAILY_MEMOS_KEY, JSON.stringify(memos));
    }
  } catch {
    // ignore
  }
}

export function queuePendingDailyMemo(memo: AppDailyMemo) {
  const pending = readPendingDailyMemos();
  if (pending.some((m) => m.id === memo.id)) {
    writePendingDailyMemos(pending.map((m) => (m.id === memo.id ? memo : m)));
  } else {
    writePendingDailyMemos([...pending, memo]);
  }
}

export function dequeuePendingDailyMemo(id: string) {
  writePendingDailyMemos(readPendingDailyMemos().filter((m) => m.id !== id));
}

export function mergeDailyMemosWithPending(server: AppDailyMemo[]): AppDailyMemo[] {
  const pending = readPendingDailyMemos();
  if (pending.length === 0) return server;
  const byId = new Map(server.map((m) => [m.id, m]));
  for (const memo of pending) {
    byId.set(memo.id, memo);
  }
  return [...byId.values()].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

/** Merge multiple memos on the same date into one entry (oldest id kept). */
export function consolidateDailyMemosByDate(memos: AppDailyMemo[]): AppDailyMemo[] {
  const byDate = new Map<string, AppDailyMemo[]>();
  for (const memo of memos) {
    const list = byDate.get(memo.date) ?? [];
    list.push(memo);
    byDate.set(memo.date, list);
  }

  const consolidated: AppDailyMemo[] = [];
  for (const [date, list] of byDate) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const body = list
      .map((m) => m.body.trim())
      .filter(Boolean)
      .join("\n");
    consolidated.push({
      id: list[0].id,
      date,
      body,
      createdAt: list[0].createdAt,
    });
  }

  return consolidated.sort((a, b) => a.date.localeCompare(b.date));
}

export function readPendingDailyDiaries(): AppDailyDiary[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(PENDING_DAILY_DIARIES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AppDailyDiary[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writePendingDailyDiaries(diaries: AppDailyDiary[]) {
  if (typeof window === "undefined") return;
  try {
    if (diaries.length === 0) {
      localStorage.removeItem(PENDING_DAILY_DIARIES_KEY);
    } else {
      localStorage.setItem(PENDING_DAILY_DIARIES_KEY, JSON.stringify(diaries));
    }
  } catch {
    // ignore
  }
}

export function queuePendingDailyDiary(diary: AppDailyDiary) {
  const pending = readPendingDailyDiaries();
  if (pending.some((d) => d.id === diary.id)) {
    writePendingDailyDiaries(pending.map((d) => (d.id === diary.id ? diary : d)));
  } else {
    writePendingDailyDiaries([...pending, diary]);
  }
}

export function dequeuePendingDailyDiary(id: string) {
  writePendingDailyDiaries(readPendingDailyDiaries().filter((d) => d.id !== id));
}

export function mergeDailyDiariesWithPending(server: AppDailyDiary[]): AppDailyDiary[] {
  const pending = readPendingDailyDiaries();
  if (pending.length === 0) return server;
  const byId = new Map(server.map((d) => [d.id, d]));
  for (const diary of pending) {
    byId.set(diary.id, diary);
  }
  return [...byId.values()].sort((a, b) => {
    const dateCmp = a.date.localeCompare(b.date);
    if (dateCmp !== 0) return dateCmp;
    return a.createdAt.localeCompare(b.createdAt);
  });
}

export function consolidateDailyDiariesByDate(diaries: AppDailyDiary[]): AppDailyDiary[] {
  const byDate = new Map<string, AppDailyDiary[]>();
  for (const diary of diaries) {
    const list = byDate.get(diary.date) ?? [];
    list.push(diary);
    byDate.set(diary.date, list);
  }

  const consolidated: AppDailyDiary[] = [];
  for (const [date, list] of byDate) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const body = list
      .map((d) => d.body.trim())
      .filter(Boolean)
      .join("\n");
    consolidated.push({
      id: list[0].id,
      date,
      body,
      createdAt: list[0].createdAt,
    });
  }

  return consolidated.sort((a, b) => a.date.localeCompare(b.date));
}
