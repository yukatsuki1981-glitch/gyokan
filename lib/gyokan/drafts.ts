import { enrichTaskWithCase, buildCaseById } from "./task-case";
import type { AppCase, AppEvent, AppMemo, AppTask } from "./types";
import { parseCaseDeadlineInput } from "./date-format";
import {
  applyEventDraft,
  eventDraftFieldsDiffer,
  type EventDraftFields,
} from "./events";

const DRAFT_PREFIX = "gyokan-draft-v1";

export type DraftKind = "case" | "task" | "memo" | "event";
export type { EventDraftFields };

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
  memo: string;
  color?: "red" | "yellow";
};

export type MemoDraftFields = {
  date: string;
  body: string;
};

type DraftEnvelope<T> = {
  updatedAt: number;
  data: T;
  /**
   * The values the form started from when the draft was written. Lets a
   * later reader tell the fields the user actually edited apart from ones
   * that merely mirror what the server held at the time. Missing on drafts
   * written before this was recorded.
   */
  baseline?: T;
};

function draftKey(kind: DraftKind, id: string) {
  return `${DRAFT_PREFIX}:${kind}:${id}`;
}

function readDraftEnvelope<T>(kind: DraftKind, id: string): DraftEnvelope<T> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(draftKey(kind, id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftEnvelope<T>;
    return parsed?.data ? parsed : null;
  } catch {
    return null;
  }
}

export function readDraft<T>(kind: DraftKind, id: string): T | null {
  return readDraftEnvelope<T>(kind, id)?.data ?? null;
}

export function writeDraft<T>(kind: DraftKind, id: string, data: T, baseline?: T) {
  if (typeof window === "undefined") return;
  try {
    const envelope: DraftEnvelope<T> = { updatedAt: Date.now(), data, baseline };
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
      title: draft.title.trim() || item.title,
      project: draft.project || item.project,
      goal: draft.goal,
      status: draft.status,
      statusTone: draft.statusTone,
      deadline: parseCaseDeadlineInput(draft.deadline),
    };
  });
}

/** The task's current values in the shape the task form (and its drafts) use. */
export function taskToDraftFields(item: AppTask): TaskDraftFields {
  return {
    title: item.title,
    caseId: item.caseId ?? "",
    date: item.date,
    dateEnd: item.dateEnd ?? "",
    useRange: !!item.dateEnd && item.dateEnd !== item.date,
    memo: item.memo ?? "",
    color: item.color,
  };
}

function effectiveDateEnd(fields: TaskDraftFields) {
  return fields.useRange && fields.dateEnd && fields.dateEnd !== fields.date
    ? fields.dateEnd
    : undefined;
}

/**
 * The independently editable parts of a task draft. The schedule (date, end
 * date, range toggle) is one part so a draft never mixes its start date with
 * the server's end date.
 */
const TASK_DRAFT_PARTS: {
  key: (f: TaskDraftFields) => string;
  pick: (f: TaskDraftFields) => Partial<TaskDraftFields>;
}[] = [
  { key: (f) => f.title, pick: (f) => ({ title: f.title }) },
  { key: (f) => f.caseId ?? "", pick: (f) => ({ caseId: f.caseId }) },
  {
    key: (f) => `${f.date}|${effectiveDateEnd(f) ?? ""}`,
    pick: (f) => ({ date: f.date, dateEnd: f.dateEnd, useRange: f.useRange }),
  },
  { key: (f) => f.memo ?? "", pick: (f) => ({ memo: f.memo }) },
  { key: (f) => f.color ?? "", pick: (f) => ({ color: f.color }) },
];

/**
 * Decides what an unsaved task draft should still contribute on top of the
 * server's copy of `item`, returning the form values to use — or null when
 * the draft has nothing left to contribute (it is then deleted).
 *
 * A draft must never roll back a value that was saved after it was written
 * (e.g. a deadline moved by drag-and-drop):
 * - Drafts that record their baseline only contribute the fields the user
 *   actually edited; where the server has since changed that same field
 *   too, the newer of the two wins.
 * - Older drafts without a baseline can't say what was edited, so they are
 *   only trusted while the server copy is no newer than the draft.
 */
export function resolveTaskDraft(item: AppTask): TaskDraftFields | null {
  const envelope = readDraftEnvelope<TaskDraftFields>("task", item.id);
  if (!envelope) return null;

  const serverSavedAt = item.updatedAt ? Date.parse(item.updatedAt) : NaN;
  const serverIsNewer = Number.isFinite(serverSavedAt) && serverSavedAt > envelope.updatedAt;

  if (!envelope.baseline) {
    if (serverIsNewer) {
      clearDraft("task", item.id);
      return null;
    }
    return envelope.data;
  }

  const current = taskToDraftFields(item);
  let resolved = current;
  let edited = false;
  for (const part of TASK_DRAFT_PARTS) {
    const drafted = part.key(envelope.data);
    const base = part.key(envelope.baseline);
    if (drafted === base) continue;
    edited = true;
    if (part.key(current) !== base && serverIsNewer) continue;
    resolved = { ...resolved, ...part.pick(envelope.data) };
  }

  if (!edited) {
    clearDraft("task", item.id);
    return null;
  }
  return resolved;
}

/** `item` with the form values from a resolved draft applied. */
export function applyTaskDraft(item: AppTask, fields: TaskDraftFields): AppTask {
  return {
    ...item,
    title: fields.title,
    caseId: fields.caseId || undefined,
    date: fields.date,
    dateEnd: effectiveDateEnd(fields),
    memo: fields.memo ?? item.memo,
    color: fields.color,
  };
}

export function mergeTasksWithDrafts(
  tasks: AppTask[],
  cases: AppCase[] = [],
): AppTask[] {
  const caseById = buildCaseById(cases);
  return tasks.map((item) => {
    const fields = resolveTaskDraft(item);
    return enrichTaskWithCase(fields ? applyTaskDraft(item, fields) : item, caseById);
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
  const current = taskToDraftFields(item);
  return TASK_DRAFT_PARTS.some((part) => part.key(current) !== part.key(draft));
}

export function memoDraftDiffers(item: AppMemo, draft: MemoDraftFields) {
  return item.date !== draft.date || item.body !== draft.body;
}

export function mergeEventsWithDrafts(events: AppEvent[]): AppEvent[] {
  return events.map((item) => {
    const draft = readDraft<EventDraftFields>("event", item.id);
    if (!draft) return item;
    return applyEventDraft(item, draft);
  });
}

export function eventDraftDiffers(item: AppEvent, draft: EventDraftFields) {
  return eventDraftFieldsDiffer(item, draft);
}
