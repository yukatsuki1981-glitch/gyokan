import { enrichTaskWithCase, buildCaseById } from "./task-case";
import type { AppCase, AppMemo, AppTask } from "./types";
import { formatCaseDeadlineForInput, parseCaseDeadlineInput } from "./date-format";

const DRAFT_PREFIX = "gyokan-draft-v1";

export type DraftKind = "case" | "task" | "memo";

export type CaseDraftFields = {
  title: string;
  project: string;
  goal: string;
  status: string;
  statusTone: AppCase["statusTone"];
  deadline: string;
};

export type TaskDraftFields = {
  title: string;
  caseId: string;
  date: string;
  dateEnd?: string;
  useRange: boolean;
};

export type MemoDraftFields = {
  date: string;
  body: string;
};

type DraftEnvelope<T> = {
  updatedAt: number;
  data: T;
};

function draftKey(kind: DraftKind, id: string) {
  return `${DRAFT_PREFIX}:${kind}:${id}`;
}

export function readDraft<T>(kind: DraftKind, id: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(kind, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(kind: DraftKind, id: string, data: T) {
  if (typeof window === "undefined") return;
  try {
    const envelope: DraftEnvelope<T> = { updatedAt: Date.now(), data };
    localStorage.setItem(draftKey(kind, id), JSON.stringify(envelope));
  } catch {
    // ignore quota errors
  }
}

export function clearDraft(kind: DraftKind, id: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(draftKey(kind, id));
  } catch {
    // ignore
  }
}

export function mergeCasesWithDrafts(cases: AppCase[]): AppCase[] {
  return cases.map((item) => {
    const draft = readDraft<CaseDraftFields>("case", item.id);
    if (!draft) return item;
    return {
      ...item,
      title: draft.title,
      project: draft.project,
      goal: draft.goal,
      status: draft.status,
      statusTone: draft.statusTone,
      deadline: parseCaseDeadlineInput(draft.deadline),
    };
  });
}

export function mergeTasksWithDrafts(
  tasks: AppTask[],
  cases: AppCase[] = [],
): AppTask[] {
  const caseById = buildCaseById(cases);
  return tasks.map((item) => {
    const draft = readDraft<TaskDraftFields>("task", item.id);
    if (!draft) return enrichTaskWithCase(item, caseById);
    const dateEnd =
      draft.useRange && draft.dateEnd && draft.dateEnd !== draft.date
        ? draft.dateEnd
        : undefined;
    return enrichTaskWithCase(
      {
        ...item,
        title: draft.title,
        caseId: draft.caseId || item.caseId,
        date: draft.date,
        dateEnd,
      },
      caseById,
    );
  });
}

export function mergeMemosWithDrafts(memos: AppMemo[]): AppMemo[] {
  return memos.map((item) => {
    const draft = readDraft<MemoDraftFields>("memo", item.id);
    if (!draft) return item;
    return {
      ...item,
      date: draft.date,
      body: draft.body,
    };
  });
}

export function memoDraftId(memo: ProjectMemoRef | null, project: string) {
  return memo?.id ?? `new:${project}`;
}

type ProjectMemoRef = { id: string };

export function caseDraftDiffers(item: AppCase, draft: CaseDraftFields) {
  return (
    item.title !== draft.title ||
    item.project !== draft.project ||
    item.goal !== draft.goal ||
    item.status !== draft.status ||
    item.statusTone !== draft.statusTone ||
    item.deadline !== parseCaseDeadlineInput(draft.deadline)
  );
}

export function taskDraftDiffers(item: AppTask, draft: TaskDraftFields) {
  const dateEnd =
    draft.useRange && draft.dateEnd && draft.dateEnd !== draft.date
      ? draft.dateEnd
      : undefined;
  return (
    item.title !== draft.title ||
    (item.caseId ?? "") !== draft.caseId ||
    item.date !== draft.date ||
    (item.dateEnd ?? undefined) !== dateEnd
  );
}

export function memoDraftDiffers(item: AppMemo, draft: MemoDraftFields) {
  return item.date !== draft.date || item.body !== draft.body;
}
