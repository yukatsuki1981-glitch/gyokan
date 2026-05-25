"use client";

import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

/* ─── Types ─── */

type Task = {
  id: string;
  title: string;
  time: string;
  date: string;
  dateEnd?: string;
  done: boolean;
  project: string;
  starred?: boolean;
};

type CaseItem = {
  id: string;
  title: string;
  project: string;
  status: string;
  statusTone: "blue" | "amber" | "emerald" | "violet";
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

type MobileTab = "home" | "cases" | "projects" | "more";

/* ─── Constants ─── */

const STORAGE_KEY = "gyokan-tasks-v5";
const CASES_STORAGE_KEY = "gyokan-cases-v6";
const ALL_PROJECTS_LABEL = "すべての案件";

const PROJECT_NAMES = [
  "AP浦安",
  "AP葛西",
  "BP篠崎",
  "CP篠崎",
  "門前仲町",
  "立川倉庫",
] as const;

const PROJECTS = [ALL_PROJECTS_LABEL, ...PROJECT_NAMES] as const;

const CASE_TAG_ASSIGNMENTS = [
  "AP葛西",
  "BP篠崎",
  "AP浦安",
  "立川倉庫",
  "CP篠崎",
  "門前仲町",
  "AP浦安",
  "AP葛西",
  "BP篠崎",
  "CP篠崎",
] as const;

const TASK_TAG_ASSIGNMENTS = [
  "門前仲町",
  "AP浦安",
  "CP篠崎",
  "AP葛西",
  "立川倉庫",
  "BP篠崎",
  "AP葛西",
  "門前仲町",
  "AP浦安",
  "BP篠崎",
] as const;

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO() {
  return isoDate(new Date());
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}

function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return isoDate(d);
}

function shiftISODate(iso: string, delta: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return isoDate(d);
}

function formatDateJa(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

function taskSectionLabel(viewDate: string) {
  if (viewDate === todayISO()) return "今日のタスク";
  return `${formatMonthDay(viewDate)}のタスク`;
}

const CASE_HOME_VISIBLE = 8;

function getCaseGridDisplay(cases: CaseItem[]) {
  const visible = cases.slice(0, CASE_HOME_VISIBLE);
  const hiddenCount = Math.max(0, cases.length - CASE_HOME_VISIBLE);
  return { visible, hiddenCount };
}

const DEFAULT_CASES: CaseItem[] = [
  ...CASE_TAG_ASSIGNMENTS.map((project, i) => ({
    id: `c${i + 1}`,
    title: "未入力",
    project,
    status: "情報収集中",
    statusTone: (["blue", "amber", "emerald", "violet"] as const)[i % 4],
    deadline: "2026/12/31",
    progress: 0,
    goal: "",
    subtasksDone: 0,
    subtasksTotal: 5,
    comments: 0,
    done: false,
    createdAt: isoDate(new Date()).replace(/-/g, "."),
    completedAt: null,
  })),
  {
    id: "c11",
    title: "未入力",
    project: "門前仲町",
    status: "提案準備中",
    statusTone: "amber",
    deadline: "2026/12/31",
    progress: 0,
    goal: "",
    subtasksDone: 0,
    subtasksTotal: 5,
    comments: 0,
    done: false,
    createdAt: isoDate(new Date()).replace(/-/g, "."),
    completedAt: null,
  },
];

const DEFAULT_TASKS: Task[] = [
  ...TASK_TAG_ASSIGNMENTS.map((project, i) => ({
    id: `t${i + 1}`,
    title: "未入力",
    time: "今日",
    date: todayISO(),
    done: false,
    project,
  })),
  {
    id: "t-range-1",
    title: "未入力",
    time: "～6/5",
    date: "2026-05-24",
    dateEnd: "2026-06-05",
    done: false,
    project: "AP葛西",
  },
  {
    id: "t-range-2",
    title: "未入力",
    time: "～6/5",
    date: "2026-05-24",
    dateEnd: "2026-06-05",
    done: false,
    project: "BP篠崎",
  },
  {
    id: "t-incomplete-1",
    title: "未入力",
    time: "昨日",
    date: yesterdayISO(),
    done: false,
    project: "AP浦安",
  },
];

const PROJECT_OPTIONS = PROJECTS.filter((p) => p !== ALL_PROJECTS_LABEL);
const STATUS_OPTIONS: { label: string; tone: CaseItem["statusTone"] }[] = [
  { label: "売却活動中", tone: "blue" },
  { label: "提案準備中", tone: "amber" },
  { label: "情報収集中", tone: "emerald" },
  { label: "内見調整中", tone: "violet" },
];

const TONE = {
  blue: { badge: "bg-blue-50 text-blue-600", bar: "bg-blue-500" },
  amber: { badge: "bg-amber-50 text-amber-600", bar: "bg-amber-400" },
  emerald: { badge: "bg-emerald-50 text-emerald-600", bar: "bg-emerald-500" },
  violet: { badge: "bg-violet-50 text-violet-600", bar: "bg-violet-500" },
} as const;

const TAG_COLOR: Record<string, string> = {
  "AP浦安": "bg-blue-50 text-blue-600",
  "AP葛西": "bg-sky-50 text-sky-600",
  "BP篠崎": "bg-amber-50 text-amber-600",
  "CP篠崎": "bg-emerald-50 text-emerald-600",
  "門前仲町": "bg-violet-50 text-violet-600",
  "立川倉庫": "bg-rose-50 text-rose-600",
  個人: "bg-gray-100 text-gray-600",
};

/* ─── Helpers ─── */

function uid() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function uidCase() {
  return `case-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatCaseDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function formatCaseDeadlineForInput(deadline: string) {
  if (!deadline) return "";
  return deadline.replace(/\./g, "-").replace(/\//g, "-");
}

function parseCaseDeadlineInput(value: string) {
  if (!value) return "";
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return "";
  return `${y}/${m}/${d}`;
}

function normalizeCase(item: CaseItem): CaseItem {
  return {
    ...item,
    deadline: item.deadline ?? "",
    createdAt: item.createdAt ?? "2026.02.01",
    completedAt: item.completedAt ?? null,
  };
}

function normalizeTask(item: Task): Task {
  const date = item.date ?? todayISO();
  return {
    ...item,
    date,
    dateEnd: item.dateEnd && item.dateEnd !== date ? item.dateEnd : undefined,
  };
}

function isRangeTask(task: Task) {
  return !!task.dateEnd && task.dateEnd !== task.date;
}

function isActiveRangeTask(task: Task, today: string) {
  return isRangeTask(task) && today >= task.date && today <= task.dateEnd!;
}

function formatMonthDay(iso: string) {
  const d = new Date(iso + "T12:00:00");
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function formatTaskPeriod(task: Task) {
  if (isRangeTask(task)) {
    return `～${formatMonthDay(task.dateEnd!)}`;
  }
  if (task.date === todayISO()) return "今日";
  if (task.date === tomorrowISO()) return "明日";
  return formatMonthDay(task.date);
}

type CalendarCell = {
  day: number;
  inMonth: boolean;
};

function getCalendarGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: CalendarCell[] = [];

  const prevLast = new Date(year, month, 0).getDate();
  for (let i = first.getDay() - 1; i >= 0; i--) {
    cells.push({ day: prevLast - i, inMonth: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ day: d, inMonth: true });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next++, inMonth: false });
  }
  return cells;
}

function getGridCellIso(year: number, month: number, cellIndex: number) {
  const startDow = new Date(year, month, 1).getDay();
  const d = new Date(year, month, 1 - startDow + cellIndex);
  return isoDate(d);
}

function buildSingleDayTasksByDate(tasks: Task[]) {
  const map = new Map<string, Task[]>();
  for (const task of tasks) {
    if (isRangeTask(task)) continue;
    const list = map.get(task.date) ?? [];
    list.push(task);
    map.set(task.date, list);
  }
  return map;
}

const CALENDAR_CELL_ROW_H = 80;
const CALENDAR_TASK_PREVIEW_MAX = 5;

const CALENDAR_TASK_CHARS = 4;
const CALENDAR_MONTH_HEADER_H = 40;
const CALENDAR_WEEKDAY_HEADER_H = 28;
const CALENDAR_MONTH_PADDING_V = 16;

function truncateCalendarTaskTitle(title: string, max = CALENDAR_TASK_CHARS) {
  const trimmed = title.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max);
}

function buildMonthRange(centerISO: string, before = 6, after = 6) {
  const center = new Date(centerISO + "T12:00:00");
  const months: { year: number; month: number }[] = [];
  for (let i = -before; i <= after; i++) {
    const d = new Date(center.getFullYear(), center.getMonth() + i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }
  return months;
}

function sortTasksByDateWithDoneLast(tasks: Task[], date: string) {
  const forDate = tasks.filter((t) => !isRangeTask(t) && t.date === date);
  const active = forDate.filter((t) => !t.done);
  const done = forDate.filter((t) => t.done);
  let activeIdx = 0;
  let doneIdx = 0;
  return tasks.map((t) => {
    if (isRangeTask(t) || t.date !== date) return t;
    if (activeIdx < active.length) return active[activeIdx++]!;
    return done[doneIdx++]!;
  });
}

function calendarDayCellClass(
  dayOfWeek: number,
  inMonth: boolean,
  isSelected: boolean,
  isToday: boolean,
) {
  if (isSelected) return "bg-blue-500 text-white";
  if (isToday) return "bg-blue-100 text-blue-600";
  if (!inMonth) return "text-gray-300";
  if (dayOfWeek === 0) return "text-rose-500 hover:bg-rose-50";
  if (dayOfWeek === 6) return "text-blue-500 hover:bg-blue-50";
  return "text-gray-700 hover:bg-gray-50";
}

function mobileCalendarDayCellClass(
  dayOfWeek: number,
  inMonth: boolean,
  isSelected: boolean,
  isToday: boolean,
) {
  if (isSelected && isToday) return "ring-2 ring-inset ring-gray-900 font-semibold text-gray-900";
  if (isSelected) return "ring-2 ring-inset ring-blue-300 font-semibold text-gray-900";
  if (isToday && inMonth) return "ring-2 ring-inset ring-gray-900 font-semibold text-gray-900";
  if (!inMonth) return "text-gray-300";
  if (dayOfWeek === 0) return "text-rose-500";
  if (dayOfWeek === 6) return "text-blue-500";
  return "text-gray-800";
}

function tagColor(project: string) {
  return TAG_COLOR[project] ?? "bg-gray-100 text-gray-600";
}

function truncateTagText(text: string, maxLen = 5) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function ProjectNameTag({ name, muted }: { name: string; muted?: boolean }) {
  return (
    <span
      className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium ${
        muted ? "bg-gray-400/40 text-gray-200" : tagColor(name)
      }`}
      title={name}
    >
      {truncateTagText(name)}
    </span>
  );
}

/* ─── Icons ─── */

function Icon({ name, className = "h-5 w-5" }: { name: string; className?: string }) {
  const p = {
    className,
    fill: "none" as const,
    viewBox: "0 0 24 24",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const map: Record<string, ReactNode> = {
    menu: <svg {...p}><path d="M4 7h16M4 12h16M4 17h16" /></svg>,
    chevronLeft: <svg {...p}><path d="M15 6l-6 6 6 6" /></svg>,
    chevronRight: <svg {...p}><path d="M9 6l6 6-6 6" /></svg>,
    folder: <svg {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
    folderOpen: <svg {...p}><path d="M5 19V7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2H5zM3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>,
    plus: <svg {...p}><path d="M12 5v14M5 12h14" /></svg>,
    home: <svg {...p}><path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z" /></svg>,
    calendar: <svg {...p}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>,
    cases: <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
    more: <svg {...p}><circle cx="6" cy="12" r="1.25" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.25" fill="currentColor" stroke="none" /><circle cx="18" cy="12" r="1.25" fill="currentColor" stroke="none" /></svg>,
    grip: <svg {...p} strokeWidth={2}><circle cx="9" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="6" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="9" cy="18" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="18" r="1" fill="currentColor" stroke="none" /></svg>,
    check: <svg {...p} strokeWidth={2.5}><path d="M5 12l4 4L19 6" /></svg>,
    bookmark: <svg {...p}><path d="M6 4h12v16l-6-4-6 4z" /></svg>,
    bookmarkFill: <svg {...p} fill="currentColor"><path d="M6 4h12v16l-6-4-6 4z" stroke="none" /></svg>,
    message: <svg {...p}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 1 1 16 0z" /></svg>,
    bell: <svg {...p}><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
    x: <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
    trash: <svg {...p}><path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 13h10l1-13" /></svg>,
  };

  return map[name] ?? null;
}

/* ─── UI Primitives ─── */

function StatusBadge({ label, tone }: { label: string; tone: CaseItem["statusTone"] }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE[tone].badge}`}>
      {label}
    </span>
  );
}

function Card({
  children,
  className = "",
  glass = true,
}: {
  children: ReactNode;
  className?: string;
  glass?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border transition-all duration-200 ${
        glass
          ? "border-black/[0.06] bg-white/75 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl"
          : "border-gray-100 bg-white shadow-sm"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function DetailOverlay({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="overlay-in absolute inset-0 bg-black/25 backdrop-blur-md" />
      <div
        className="modal-pop relative w-full max-w-md overflow-hidden rounded-3xl border border-white/60 bg-white/85 shadow-[0_24px_80px_rgba(0,0,0,0.18)] backdrop-blur-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-black/[0.05] px-6 py-4">
          <h3 className="text-[17px] font-semibold tracking-tight text-gray-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/[0.04] text-gray-500 transition-colors hover:bg-black/[0.08]"
            aria-label="閉じる"
          >
            <Icon name="x" className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mb-4 block last:mb-0">
      <span className="mb-1.5 block text-[12px] font-medium text-gray-400">{label}</span>
      {children}
    </label>
  );
}

const fieldInputClass =
  "w-full rounded-xl border border-black/[0.08] bg-black/[0.02] px-3 py-2.5 text-[14px] text-gray-900 outline-none transition-colors focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/10";

function CaseDetailEditor({
  item,
  onSave,
  onClose,
}: {
  item: CaseItem;
  onSave: (
    id: string,
    data: {
      title: string;
      project: string;
      goal: string;
      status: string;
      statusTone: CaseItem["statusTone"];
      deadline: string;
    },
  ) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [project, setProject] = useState(item.project);
  const [goal, setGoal] = useState(item.goal);
  const [status, setStatus] = useState(item.status);
  const [deadline, setDeadline] = useState(formatCaseDeadlineForInput(item.deadline));

  const save = () => {
    if (!title.trim()) return;
    const tone = STATUS_OPTIONS.find((s) => s.label === status)?.tone ?? item.statusTone;
    onSave(item.id, {
      title: title.trim(),
      project,
      goal: goal.trim(),
      status,
      statusTone: tone,
      deadline: parseCaseDeadlineInput(deadline),
    });
    onClose();
  };

  return (
    <div>
      <DetailField label="案件名">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldInputClass} />
      </DetailField>
      <DetailField label="プロジェクト">
        <select value={project} onChange={(e) => setProject(e.target.value)} className={fieldInputClass}>
          {PROJECT_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </DetailField>
      <DetailField label="ステータス">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={fieldInputClass}>
          {STATUS_OPTIONS.map((s) => (
            <option key={s.label} value={s.label}>{s.label}</option>
          ))}
        </select>
      </DetailField>
      <DetailField label="期限">
        <input
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className={fieldInputClass}
        />
      </DetailField>
      <DetailField label="目標">
        <textarea value={goal} onChange={(e) => setGoal(e.target.value)} rows={3} className={`${fieldInputClass} resize-none`} />
      </DetailField>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-[13px] font-medium text-gray-500 hover:bg-black/[0.04]">キャンセル</button>
        <button type="button" onClick={save} className="rounded-xl bg-[#007AFF] px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-600">保存</button>
      </div>
    </div>
  );
}

function TaskDetailEditor({
  item,
  onSave,
  onClose,
}: {
  item: Task;
  onSave: (id: string, data: { title: string; project: string; date: string; dateEnd?: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(item.title);
  const [project, setProject] = useState(item.project);
  const [date, setDate] = useState(item.date);
  const [dateEnd, setDateEnd] = useState(item.dateEnd ?? "");
  const [useRange, setUseRange] = useState(isRangeTask(item));

  const save = () => {
    if (!title.trim()) return;
    const end =
      useRange && dateEnd && dateEnd !== date ? dateEnd : undefined;
    onSave(item.id, {
      title: title.trim(),
      project,
      date,
      dateEnd: end,
    });
    onClose();
  };

  return (
    <div>
      <DetailField label="タスク名">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldInputClass} />
      </DetailField>
      <DetailField label="プロジェクト">
        <select value={project} onChange={(e) => setProject(e.target.value)} className={fieldInputClass}>
          {PROJECT_OPTIONS.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </DetailField>
      {!useRange && (
        <DetailField label="期限">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldInputClass} />
        </DetailField>
      )}
      <label className="mb-4 flex items-center gap-2 text-[13px] text-gray-600">
        <input
          type="checkbox"
          checked={useRange}
          onChange={(e) => {
            const checked = e.target.checked;
            setUseRange(checked);
            if (checked && !dateEnd) {
              setDateEnd(date);
            }
          }}
          className="rounded border-gray-300"
        />
        期限指定
      </label>
      {useRange && (
        <>
          <DetailField label="開始日">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldInputClass} />
          </DetailField>
          <DetailField label="終了日">
            <input type="date" value={dateEnd || date} onChange={(e) => setDateEnd(e.target.value)} className={fieldInputClass} />
          </DetailField>
        </>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-[13px] font-medium text-gray-500 hover:bg-black/[0.04]">キャンセル</button>
        <button type="button" onClick={save} className="rounded-xl bg-[#007AFF] px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-600">保存</button>
      </div>
    </div>
  );
}

/* ─── Case Card ─── */

function mergeDragHandleProps(props?: Record<string, unknown>) {
  const fromProps = (props ?? {}) as {
    className?: string;
    style?: CSSProperties;
    [key: string]: unknown;
  };
  const { className, style, ...rest } = fromProps;
  return {
    ...rest,
    className:
      `drag-handle cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing ${className ?? ""}`.trim(),
    style: { touchAction: "none", ...style },
  };
}

function CaseCard({
  item,
  onToggle,
  onOpen,
  showProjectTag = false,
  sortable = false,
  dragHandleProps,
  isDragging = false,
}: {
  item: CaseItem;
  onToggle: (id: string) => void;
  onOpen: (item: CaseItem) => void;
  showProjectTag?: boolean;
  sortable?: boolean;
  dragHandleProps?: Record<string, unknown>;
  isDragging?: boolean;
}) {
  const projectLabel = item.project;
  return (
    <article
      onClick={() => onOpen(item)}
      className={`group flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all duration-300 ${
        isDragging
          ? "z-50 scale-[1.04] border-blue-200/60 bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)] ring-1 ring-blue-200/40"
          : "border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)]"
      } ${
        item.done ? "opacity-60" : ""
      } ${sortable ? "select-none" : ""}`}
    >
      {sortable && (
        <button
          type="button"
          aria-label="並び替え"
          onClick={(e) => e.stopPropagation()}
          {...mergeDragHandleProps(dragHandleProps)}
        >
          <Icon name="grip" className="h-3.5 w-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item.id);
        }}
        aria-label={item.done ? "進行中に戻す" : "完了にする"}
        className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-all duration-200 ${
          item.done
            ? "border-[#007AFF] bg-[#007AFF] text-white"
            : "border-gray-300 bg-white hover:border-[#007AFF]"
        }`}
      >
        {item.done && <Icon name="check" className="h-2.5 w-2.5" />}
      </button>
      <h4
        className={`min-w-0 flex-1 truncate text-[12px] font-medium ${
          item.done ? "text-gray-400 line-through" : "text-gray-900"
        }`}
      >
        {item.title}
      </h4>
      {item.done ? (
        <span className="shrink-0 text-[10px] font-medium text-gray-400">完了</span>
      ) : showProjectTag ? (
        <ProjectNameTag name={projectLabel} />
      ) : (
        <StatusBadge label={item.status} tone={item.statusTone} />
      )}
    </article>
  );
}

function OverflowCaseTile({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-full min-h-[32px] cursor-pointer items-center justify-center rounded-xl border border-dashed border-black/[0.12] bg-black/[0.02] px-2 py-1.5 text-[11px] font-medium leading-tight text-gray-500 transition-all duration-200 hover:border-[#007AFF]/40 hover:bg-[#007AFF]/5 hover:text-[#007AFF]"
    >
      他{count}件すべてを見る
    </button>
  );
}

function CasesListSection({
  cases,
  onToggle,
  onOpen,
  onBack,
  sensors,
  onDragEnd,
}: {
  cases: CaseItem[];
  onToggle: (id: string) => void;
  onOpen: (item: CaseItem) => void;
  onBack: () => void;
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  const ongoing = cases.filter((c) => !c.done);

  return (
    <section>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-black/[0.04]"
          aria-label="戻る"
        >
          <Icon name="chevronLeft" className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-[17px] font-semibold text-gray-900">案件一覧</h2>
          <p className="text-[13px] text-gray-400">進行中 {ongoing.length}件</p>
        </div>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <SortableContext items={ongoing.map((c) => c.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2">
            {ongoing.map((c) => (
              <SortableCaseCard
                key={c.id}
                item={c}
                onToggle={onToggle}
                onOpen={onOpen}
                showProjectTag
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </section>
  );
}

function SortableCaseCard({
  item,
  onToggle,
  onOpen,
  showProjectTag,
}: {
  item: CaseItem;
  onToggle: (id: string) => void;
  onOpen: (item: CaseItem) => void;
  showProjectTag?: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <CaseCard
        item={item}
        onToggle={onToggle}
        onOpen={onOpen}
        showProjectTag={showProjectTag}
        sortable
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

/* ─── Project Detail Case Row ─── */

function DetailCaseCard({
  item,
  onToggle,
  onOpen,
}: {
  item: CaseItem;
  onToggle: (id: string) => void;
  onOpen: (item: CaseItem) => void;
}) {
  return (
    <article
      onClick={() => onOpen(item)}
      className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition-all duration-200 ${
        item.done
          ? "border-gray-200/80 bg-gray-200/70"
          : "border-gray-100 bg-white hover:bg-gray-50/80"
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item.id);
        }}
        aria-label={item.done ? "進行中に戻す" : "完了にする"}
        className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
          item.done
            ? "border-gray-400 bg-gray-500 text-white"
            : "border-gray-300 bg-white hover:border-blue-400"
        }`}
      >
        {item.done && <Icon name="check" className="h-3 w-3" />}
      </button>

      <h4
        className={`min-w-0 flex-1 truncate text-[13px] font-semibold ${
          item.done ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {item.title}
      </h4>

      <div className="shrink-0 text-right text-[10px] leading-relaxed text-gray-400">
        <p>発生日 {item.createdAt}</p>
        {item.done && item.completedAt && (
          <p className="text-gray-500">完了日 {item.completedAt}</p>
        )}
      </div>
    </article>
  );
}

/* ─── Project Detail ─── */

function ProjectDetailSection({
  project,
  cases,
  onToggleCase,
  onOpenCase,
}: {
  project: string;
  cases: CaseItem[];
  onToggleCase: (id: string) => void;
  onOpenCase: (item: CaseItem) => void;
}) {
  const projectCases = cases
    .filter((c) => c.project === project)
    .sort((a, b) => {
      if (a.done === b.done) return 0;
      return a.done ? 1 : -1;
    });
  const active = projectCases.filter((c) => !c.done);
  const completed = projectCases.filter((c) => c.done);

  return (
    <section className="mb-8 lg:mb-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 className="text-[17px] font-semibold text-gray-900">{project}</h3>
          <span className="text-[13px] text-gray-400">
            進行中 {active.length}件 · 完了 {completed.length}件
          </span>
        </div>
      </div>
      <Card className="overflow-hidden p-2">
        {projectCases.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-gray-400">
            このプロジェクトに紐づく案件はありません
          </p>
        ) : (
          <div className="space-y-1">
            {projectCases.map((c) => (
              <DetailCaseCard key={c.id} item={c} onToggle={onToggleCase} onOpen={onOpenCase} />
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

/* ─── Sortable Task Row ─── */

function TaskRowContent({
  task,
  onToggle,
  onDelete,
  onOpen,
  showOriginalDeadline = false,
  sortable = false,
  isDragging = false,
  dragHandleProps,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (task: Task) => void;
  showOriginalDeadline?: boolean;
  sortable?: boolean;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      onClick={() => onOpen(task)}
      className={`group flex w-full items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all duration-300 ${
        isDragging
          ? "z-50 scale-[1.04] border-blue-200/60 bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)] ring-1 ring-blue-200/40"
          : task.done
            ? "cursor-pointer border-black/[0.05] bg-black/[0.02] opacity-60"
            : "cursor-pointer border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)]"
      } ${sortable ? "select-none" : ""}`}
    >
      {sortable && (
        <button
          type="button"
          aria-label="並び替え"
          onClick={(e) => e.stopPropagation()}
          {...mergeDragHandleProps(dragHandleProps)}
        >
          <Icon name="grip" className="h-3.5 w-3.5" />
        </button>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(task.id);
        }}
        aria-label={task.done ? "未完了に戻す" : "完了にする"}
        className={`flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors duration-150 ${
          task.done
            ? "border-[#007AFF] bg-[#007AFF] text-white"
            : "border-gray-300 bg-white hover:border-[#007AFF]"
        }`}
      >
        {task.done && <Icon name="check" className="h-2.5 w-2.5" />}
      </button>

      <p
        className={`min-w-0 flex-1 truncate text-[12px] font-medium ${
          task.done ? "text-gray-400" : "text-gray-900"
        }`}
      >
        {task.title}
      </p>
      <ProjectNameTag name={task.project} muted={task.done} />
      {isRangeTask(task) && (
        <span className="shrink-0 text-[10px] text-gray-400">{formatTaskPeriod(task)}</span>
      )}
      {showOriginalDeadline && !isRangeTask(task) && (
        <span className="shrink-0 text-[10px] text-gray-400">{formatMonthDay(task.date)}</span>
      )}

      {!task.done && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(task.id);
          }}
          aria-label="削除"
          className="shrink-0 rounded-md p-1 text-gray-300 opacity-0 transition-opacity duration-150 hover:bg-rose-50 hover:text-rose-500 group-hover:opacity-100"
        >
          <Icon name="trash" className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SortableTaskRow({
  task,
  onToggle,
  onDelete,
  onOpen,
  showOriginalDeadline = false,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (task: Task) => void;
  showOriginalDeadline?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      className="min-w-0"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <TaskRowContent
        task={task}
        onToggle={onToggle}
        onDelete={onDelete}
        onOpen={onOpen}
        showOriginalDeadline={showOriginalDeadline}
        sortable
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function SortableTaskList({
  list,
  sensors,
  onDragEnd,
  onToggle,
  onDelete,
  onOpen,
  showOriginalDeadline = false,
  sortable = true,
}: {
  list: Task[];
  sensors: ReturnType<typeof useSensors>;
  onDragEnd: (event: DragEndEvent) => void;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  onOpen: (task: Task) => void;
  showOriginalDeadline?: boolean;
  sortable?: boolean;
}) {
  const listClass = "flex flex-col gap-1 lg:grid lg:grid-cols-2 lg:gap-1";

  if (!sortable) {
    return (
      <div className={listClass}>
        {list.map((task) => (
          <TaskRowContent
            key={task.id}
            task={task}
            onToggle={onToggle}
            onDelete={onDelete}
            onOpen={onOpen}
            showOriginalDeadline={showOriginalDeadline}
          />
        ))}
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
      <SortableContext items={list.map((t) => t.id)} strategy={rectSortingStrategy}>
        <div className={listClass}>
          {list.map((task) => (
            <SortableTaskRow
              key={task.id}
              task={task}
              onToggle={onToggle}
              onDelete={onDelete}
              onOpen={onOpen}
              showOriginalDeadline={showOriginalDeadline}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

/* ─── Calendar Widget ─── */

function CalendarWidget({
  tasks,
  selectedDate,
  onSelectDate,
}: {
  tasks: Task[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
}) {
  const selected = new Date(selectedDate + "T12:00:00");
  const [viewDate, setViewDate] = useState(() => selected);
  const today = new Date();
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const grid = getCalendarGrid(year, month);
  const monthLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(viewDate);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const isViewingToday =
    today.getFullYear() === year && today.getMonth() === month;

  const taskDaysInMonth = useMemo(() => {
    const set = new Set<number>();
    tasks.forEach((t) => {
      const addDay = (iso: string) => {
        const d = new Date(iso + "T12:00:00");
        if (d.getFullYear() === year && d.getMonth() === month) {
          set.add(d.getDate());
        }
      };
      addDay(t.date);
      if (t.dateEnd) addDay(t.dateEnd);
    });
    return set;
  }, [tasks, year, month]);

  const goPrev = () => setViewDate(new Date(year, month - 1, 1));
  const goNext = () => setViewDate(new Date(year, month + 1, 1));

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          aria-label="前の月"
          className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50"
        >
          <Icon name="chevronLeft" className="h-3.5 w-3.5" />
        </button>
        <span className="text-[12px] font-semibold text-gray-800">{monthLabel}</span>
        <button
          type="button"
          onClick={goNext}
          aria-label="次の月"
          className="flex h-6 w-6 items-center justify-center rounded-md text-gray-400 hover:bg-gray-50"
        >
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-0.5 grid grid-cols-7 gap-0">
        {weekdays.map((d) => (
          <div
            key={d}
            className={`py-0.5 text-center text-[10px] font-medium leading-none ${
              d === "日" ? "text-rose-400" : d === "土" ? "text-blue-400" : "text-gray-400"
            }`}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0">
        {grid.map((cell, i) => {
          const cellIso = cell.inMonth ? isoDate(new Date(year, month, cell.day)) : null;
          const isToday =
            isViewingToday && cell.inMonth && cell.day === today.getDate();
          const isSelected = cellIso === selectedDate;
          const hasTask = cell.inMonth && taskDaysInMonth.has(cell.day);
          const dayOfWeek = i % 7;

          return (
            <button
              key={`${i}-${cell.day}-${cell.inMonth}`}
              type="button"
              disabled={!cell.inMonth}
              onClick={() => cellIso && onSelectDate(cellIso)}
              className={`relative flex h-7 items-center justify-center rounded-full text-[11px] font-medium leading-none transition-all duration-200 ${calendarDayCellClass(dayOfWeek, cell.inMonth, isSelected, isToday)}`}
            >
              {cell.day}
              {hasTask && !isSelected && (
                <span className="absolute bottom-0.5 left-1/2 h-0.5 w-0.5 -translate-x-1/2 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function estimateMonthBlockHeight(year: number, month: number) {
  const rows = getCalendarGrid(year, month).length / 7;
  return (
    CALENDAR_MONTH_HEADER_H +
    CALENDAR_WEEKDAY_HEADER_H +
    rows * CALENDAR_CELL_ROW_H +
    CALENDAR_MONTH_PADDING_V
  );
}

function estimateMonthScrollTop(
  iso: string,
  months: { year: number; month: number }[],
) {
  const d = new Date(iso + "T12:00:00");
  const targetYear = d.getFullYear();
  const targetMonth = d.getMonth();

  let top = 0;
  for (const { year, month } of months) {
    if (year === targetYear && month === targetMonth) return top;
    top += estimateMonthBlockHeight(year, month);
  }
  return top;
}

function getPeekWeekScrollTop(selectedISO: string, year: number, month: number) {
  const anchorISO = shiftISODate(selectedISO, -7);
  const grid = getCalendarGrid(year, month);
  let anchorIndex = grid.findIndex((_, i) => getGridCellIso(year, month, i) === anchorISO);
  if (anchorIndex === -1) anchorIndex = 0;
  const weekStart = Math.floor(anchorIndex / 7) * 7;
  return (weekStart / 7) * CALENDAR_CELL_ROW_H;
}

function getPeekWeekScrollMax(year: number, month: number) {
  const rows = getCalendarGrid(year, month).length / 7;
  return Math.max(0, (rows - 3) * CALENDAR_CELL_ROW_H);
}

function getMonthScrollTop(
  iso: string,
  scrollEl: HTMLDivElement,
  monthRefs: Map<string, HTMLDivElement>,
) {
  const d = new Date(iso + "T12:00:00");
  const monthEl = monthRefs.get(`${d.getFullYear()}-${d.getMonth()}`);
  if (!monthEl) return 0;
  return (
    monthEl.getBoundingClientRect().top -
    scrollEl.getBoundingClientRect().top +
    scrollEl.scrollTop
  );
}

function MobileCalendarDayCell({
  cell,
  cellIndex,
  year,
  month,
  selectedDate,
  dayTasks,
  onSelect,
}: {
  cell: CalendarCell;
  cellIndex: number;
  year: number;
  month: number;
  selectedDate: string;
  dayTasks: Task[];
  onSelect: (iso: string) => void;
}) {
  const cellIso = cell.inMonth ? isoDate(new Date(year, month, cell.day)) : null;
  const isSelected = cellIso === selectedDate;
  const isToday = cellIso === todayISO();
  const dayOfWeek = cellIndex % 7;
  const preview = dayTasks.slice(0, CALENDAR_TASK_PREVIEW_MAX);
  const overflow = Math.max(0, dayTasks.length - CALENDAR_TASK_PREVIEW_MAX);

  return (
    <button
      type="button"
      disabled={!cell.inMonth}
      onClick={() => cellIso && onSelect(cellIso)}
      style={{ height: CALENDAR_CELL_ROW_H }}
      className={`relative flex flex-col border-b border-r border-black/[0.04] p-0.5 text-left transition-colors ${mobileCalendarDayCellClass(dayOfWeek, cell.inMonth, isSelected, isToday)}`}
    >
      <span className="shrink-0 px-0.5 text-[11px] font-semibold leading-none">{cell.day}</span>
      {cell.inMonth && preview.length > 0 && (
        <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-px overflow-hidden">
          {preview.map((task, i) => (
            <span
              key={task.id}
              className={`relative truncate rounded-[2px] px-0.5 text-[8px] leading-[10px] ${
                task.done
                  ? "bg-gray-200/90 text-gray-400"
                  : "bg-gray-500/90 text-white"
              }`}
              title={task.title}
            >
              {truncateCalendarTaskTitle(task.title)}
              {overflow > 0 && i === preview.length - 1 && (
                <span className="absolute -bottom-px -right-px rounded-sm bg-gray-800 px-0.5 text-[7px] font-semibold leading-none text-white">
                  +{overflow}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

function MobileCalendarWidget({
  tasks,
  selectedDate,
  onSelectDate,
  peekMode,
}: {
  tasks: Task[];
  selectedDate: string;
  onSelectDate: (iso: string) => void;
  peekMode: boolean;
}) {
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
  const [userExpanded, setUserExpanded] = useState(false);
  const [monthFocus, setMonthFocus] = useState(false);
  const [monthFocusHeight, setMonthFocusHeight] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const peekGridInnerRef = useRef<HTMLDivElement>(null);
  const monthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const peekWeekScrollRef = useRef(0);
  const touchStartY = useRef(0);
  const gestureStartY = useRef(0);
  const peekSuppressClickRef = useRef(false);
  const expandingRef = useRef(false);
  const lastScrolledMonthRef = useRef<string | null>(null);

  const showFullCalendar = !peekMode || userExpanded;
  const isPeek = peekMode && !userExpanded && !monthFocus;
  const PEEK_GRID_H = CALENDAR_CELL_ROW_H * 3;
  const FULL_SCROLL_H = "min(640px, 62vh)";

  const peekDate = useMemo(() => new Date(selectedDate + "T12:00:00"), [selectedDate]);
  const peekYear = peekDate.getFullYear();
  const peekMonth = peekDate.getMonth();

  const applyPeekWeekScroll = useCallback(
    (top: number) => {
      const max = getPeekWeekScrollMax(peekYear, peekMonth);
      const clamped = Math.max(0, Math.min(max, top));
      peekWeekScrollRef.current = clamped;
      if (peekGridInnerRef.current) {
        peekGridInnerRef.current.style.transform = `translateY(-${clamped}px)`;
      }
    },
    [peekYear, peekMonth],
  );

  const resetPeekLayout = useCallback(() => {
    setUserExpanded(false);
    setMonthFocus(false);
    setMonthFocusHeight(null);
    expandingRef.current = false;
    peekSuppressClickRef.current = false;
    const scrollEl = scrollRef.current;
    if (scrollEl) {
      scrollEl.style.maxHeight = "";
      scrollEl.style.overflowY = "";
    }
  }, []);

  const months = useMemo(() => buildMonthRange(todayISO(), 12, 12), []);

  const tasksByDate = useMemo(() => buildSingleDayTasksByDate(tasks), [tasks]);

  const applyFullScrollTop = useCallback((top: number) => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return;
    scrollEl.scrollTop = top;
  }, []);

  const scrollToSelectedMonth = useCallback(() => {
    const scrollEl = scrollRef.current;
    if (!scrollEl) return false;

    let top = estimateMonthScrollTop(selectedDate, months);
    if (monthRefs.current.size > 0) {
      const measured = getMonthScrollTop(selectedDate, scrollEl, monthRefs.current);
      if (measured > 0) top = measured;
    }
    applyFullScrollTop(top);
    return true;
  }, [selectedDate, months, applyFullScrollTop]);

  const syncPeekWeekScroll = useCallback(() => {
    if (!peekMode || showFullCalendar) return;
    applyPeekWeekScroll(getPeekWeekScrollTop(selectedDate, peekYear, peekMonth));
  }, [peekMode, showFullCalendar, selectedDate, peekYear, peekMonth, applyPeekWeekScroll]);

  const goToday = useCallback(() => {
    const today = todayISO();
    onSelectDate(today);
    resetPeekLayout();
    lastScrolledMonthRef.current = null;
    requestAnimationFrame(() => {
      const d = new Date(today + "T12:00:00");
      applyPeekWeekScroll(getPeekWeekScrollTop(today, d.getFullYear(), d.getMonth()));
    });
  }, [onSelectDate, resetPeekLayout, applyPeekWeekScroll]);

  useLayoutEffect(() => {
    if (isPeek) {
      syncPeekWeekScroll();
      return;
    }
    if (!showFullCalendar || monthFocus) return;

    const monthKey = selectedDate.slice(0, 7);
    if (lastScrolledMonthRef.current === monthKey) return;

    scrollToSelectedMonth();
    lastScrolledMonthRef.current = monthKey;
  }, [isPeek, showFullCalendar, monthFocus, selectedDate, syncPeekWeekScroll, scrollToSelectedMonth]);

  useLayoutEffect(() => {
    if (isPeek) {
      lastScrolledMonthRef.current = null;
    }
  }, [isPeek]);

  const handlePeekDaySelect = (cellIso: string) => {
    if (peekSuppressClickRef.current) return;
    onSelectDate(cellIso);
  };

  const handleFullDaySelect = useCallback(
    (cellIso: string) => {
      onSelectDate(cellIso);
    },
    [onSelectDate],
  );

  const expandToFullCalendar = useCallback(() => {
    if (userExpanded) return;
    expandingRef.current = true;
    peekSuppressClickRef.current = false;
    setUserExpanded(true);
    setMonthFocus(false);
    setMonthFocusHeight(null);
    requestAnimationFrame(() => {
      lastScrolledMonthRef.current = null;
      scrollToSelectedMonth();
      expandingRef.current = false;
    });
  }, [userExpanded, scrollToSelectedMonth]);

  const peekTouchRef = useRef<HTMLDivElement>(null);
  const peekGestureActiveRef = useRef(false);
  const expandToFullCalendarRef = useRef(expandToFullCalendar);
  const applyPeekWeekScrollRef = useRef(applyPeekWeekScroll);

  useEffect(() => {
    expandToFullCalendarRef.current = expandToFullCalendar;
    applyPeekWeekScrollRef.current = applyPeekWeekScroll;
  }, [expandToFullCalendar, applyPeekWeekScroll]);

  useEffect(() => {
    const el = peekTouchRef.current;
    if (!el || !isPeek) return;

    const onTouchStart = (e: TouchEvent) => {
      const y = e.touches[0]?.clientY ?? 0;
      touchStartY.current = y;
      gestureStartY.current = y;
      peekSuppressClickRef.current = false;
      peekGestureActiveRef.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!peekGestureActiveRef.current) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = touchStartY.current - y;
      if (Math.abs(delta) <= 2) return;

      peekSuppressClickRef.current = true;
      e.preventDefault();
      applyPeekWeekScrollRef.current(peekWeekScrollRef.current + delta);
      touchStartY.current = y;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!peekGestureActiveRef.current) return;
      peekGestureActiveRef.current = false;

      const y = e.changedTouches[0]?.clientY ?? touchStartY.current;
      const totalDelta = gestureStartY.current - y;
      if (Math.abs(totalDelta) > 80) {
        expandToFullCalendarRef.current();
        return;
      }
      if (peekSuppressClickRef.current) {
        window.setTimeout(() => {
          peekSuppressClickRef.current = false;
        }, 350);
      }
    };

    el.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    el.addEventListener("touchmove", onTouchMove, { capture: true, passive: false });
    el.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });

    return () => {
      el.removeEventListener("touchstart", onTouchStart, { capture: true });
      el.removeEventListener("touchmove", onTouchMove, { capture: true });
      el.removeEventListener("touchend", onTouchEnd, { capture: true });
      el.removeEventListener("touchcancel", onTouchEnd, { capture: true });
    };
  }, [isPeek]);

  const renderDayButton = (
    cell: CalendarCell,
    cellIndex: number,
    year: number,
    month: number,
    onSelect: (iso: string) => void,
  ) => {
    const cellIso = cell.inMonth ? isoDate(new Date(year, month, cell.day)) : null;
    const dayTasks = cellIso ? tasksByDate.get(cellIso) ?? [] : [];

    return (
      <MobileCalendarDayCell
        key={`${year}-${month}-${cellIndex}-${cell.day}-${cell.inMonth}`}
        cell={cell}
        cellIndex={cellIndex}
        year={year}
        month={month}
        selectedDate={selectedDate}
        dayTasks={dayTasks}
        onSelect={onSelect}
      />
    );
  };

  const weekdayHeader = (year: number, month: number) => (
    <div data-weekday-header className="grid grid-cols-7 border-b border-black/[0.04]">
      {weekdays.map((d) => (
        <div
          key={`${year}-${month}-${d}`}
          className={`py-1.5 text-center text-[11px] font-medium ${
            d === "日" ? "text-rose-400" : d === "土" ? "text-blue-400" : "text-gray-400"
          }`}
        >
          {d}
        </div>
      ))}
    </div>
  );

  const renderMonthHeader = (year: number, month: number, monthLabel: string) => (
    <div data-month-header className="relative mb-1 flex items-center justify-between px-2">
      <span className="text-[16px] font-semibold text-gray-900">{monthLabel}</span>
      <button
        type="button"
        onClick={goToday}
        aria-label="今日へ"
        className="relative z-10 rounded-lg px-2 py-0.5 text-[13px] font-medium text-[#007AFF] hover:bg-blue-50"
      >
        今日
      </button>
      <span className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 select-none text-[4.5rem] font-bold leading-none text-gray-100">
        {month + 1}
      </span>
    </div>
  );

  const renderDayGrid = (year: number, month: number, grid: CalendarCell[], onSelect: (iso: string) => void, touchNone = false) => (
    <div className={`grid grid-cols-7 border-l border-t border-black/[0.04]${touchNone ? " touch-none" : ""}`}>
      {grid.map((cell, i) => renderDayButton(cell, i, year, month, onSelect))}
    </div>
  );

  const peekGrid = useMemo(
    () => getCalendarGrid(peekYear, peekMonth),
    [peekYear, peekMonth],
  );
  const peekMonthLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(peekDate);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04]">
      {isPeek ? (
        <div className="px-0.5 py-2">
          {renderMonthHeader(peekYear, peekMonth, peekMonthLabel)}
          {weekdayHeader(peekYear, peekMonth)}
          <div
            ref={peekTouchRef}
            className="overflow-hidden touch-none"
            style={{ height: `${PEEK_GRID_H}px` }}
          >
            <div ref={peekGridInnerRef} className="will-change-transform">
              {renderDayGrid(peekYear, peekMonth, peekGrid, handlePeekDaySelect, true)}
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-x-hidden overflow-y-auto overscroll-contain touch-pan-y"
          style={{
            maxHeight:
              monthFocusHeight !== null ? `${monthFocusHeight}px` : FULL_SCROLL_H,
          }}
        >
          {months.map(({ year, month }, monthIndex) => {
            const grid = getCalendarGrid(year, month);
            const monthLabel = new Intl.DateTimeFormat("ja-JP", {
              year: "numeric",
              month: "long",
            }).format(new Date(year, month, 1));
            const monthBg = monthIndex % 2 === 0 ? "bg-white" : "bg-gray-50/90";

            return (
              <div
                key={`${year}-${month}`}
                ref={(el) => {
                  if (el) monthRefs.current.set(`${year}-${month}`, el);
                  else monthRefs.current.delete(`${year}-${month}`);
                }}
                className={`px-0.5 py-2 ${monthBg}`}
              >
                {renderMonthHeader(year, month, monthLabel)}
                {weekdayHeader(year, month)}
                {renderDayGrid(year, month, grid, handleFullDaySelect)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Monthly Stats ─── */

function MonthlyStats({
  activeCases,
  completedCases,
  activeTasks,
  completedTasks,
}: {
  activeCases: number;
  completedCases: number;
  activeTasks: number;
  completedTasks: number;
}) {
  return (
    <div className="space-y-5">
      <div className="flex gap-4">
        <div className="w-1 shrink-0 rounded-full bg-blue-500" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">案件</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{activeCases}<span className="ml-2 text-[13px] font-normal text-gray-400">件 進行中</span></p>
          <p className="mt-0.5 text-[12px] text-gray-400">完了 {completedCases}件</p>
        </div>
      </div>
      <div className="flex gap-4">
        <div className="w-1 shrink-0 rounded-full bg-emerald-400" />
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-gray-400">タスク</p>
          <p className="mt-2 text-2xl font-semibold tabular-nums text-gray-900">{activeTasks}<span className="ml-2 text-[13px] font-normal text-gray-400">件 未完了</span></p>
          <p className="mt-0.5 text-[12px] text-gray-400">完了 {completedTasks}件</p>
        </div>
      </div>
      <button type="button" className="flex w-full items-center justify-between text-[13px] font-medium text-blue-600 transition-all duration-200 hover:text-blue-700">
        レポートを見る <span>›</span>
      </button>
    </div>
  );
}

/* ─── Add Case Modal ─── */

function AddCaseModalForm({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { title: string; project: string }) => void;
}) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState<string>(PROJECT_OPTIONS[0]);

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), project });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-4 backdrop-blur-[2px] sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-100 bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">案件を追加</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-50">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-4 block">
          <span className="mb-2 block text-[12px] font-medium text-gray-400">案件名</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="例：未入力"
            className="w-full rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3 text-[15px] outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
            autoFocus
          />
        </label>
        <label className="mb-6 block">
          <span className="mb-2 block text-[12px] font-medium text-gray-400">プロジェクト</span>
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="w-full rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-sm outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
          >
            {PROJECT_OPTIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50">
            キャンセル
          </button>
          <button type="button" onClick={submit} className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-600">
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}

function AddCaseModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; project: string }) => void;
}) {
  if (!open) return null;
  return <AddCaseModalForm onClose={onClose} onSubmit={onSubmit} />;
}

/* ─── Add Task Modal ─── */

function AddTaskModalForm({
  onClose,
  onSubmit,
  caseTitles,
}: {
  onClose: () => void;
  onSubmit: (data: { title: string; project: string; time: string }) => void;
  caseTitles: string[];
}) {
  const [title, setTitle] = useState("");
  const [project, setProject] = useState(caseTitles[0] ?? "");
  const [time, setTime] = useState("今日");

  const submit = () => {
    if (!title.trim()) return;
    onSubmit({ title: title.trim(), project, time });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/20 p-4 backdrop-blur-[2px] sm:items-center" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-3xl border border-gray-100 bg-white p-7 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900">タスクを追加</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-50"><Icon name="x" className="h-5 w-5" /></button>
        </div>
        <label className="mb-4 block">
          <span className="mb-2 block text-[12px] font-medium text-gray-400">タスク名</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="例：内見日程の調整"
            className="w-full rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-3 text-[15px] outline-none transition-all duration-200 focus:border-blue-200 focus:bg-white focus:ring-2 focus:ring-blue-50"
            autoFocus
          />
        </label>
        <div className="mb-6 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-2 block text-[12px] font-medium text-gray-400">関連案件</span>
            <select value={project} onChange={(e) => setProject(e.target.value)} className="w-full rounded-2xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-sm outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50">
              {caseTitles.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-[12px] font-medium text-gray-400">時間</span>
            <input type="text" value={time} onChange={(e) => setTime(e.target.value)} placeholder="10:00" className="w-full rounded-2xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-sm outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50" />
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl px-5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50">キャンセル</button>
          <button type="button" onClick={submit} className="rounded-2xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-500/25 hover:bg-blue-600">追加する</button>
        </div>
      </div>
    </div>
  );
}

function AddTaskModal({
  open,
  onClose,
  onSubmit,
  caseTitles,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; project: string; time: string }) => void;
  caseTitles: string[];
}) {
  if (!open) return null;
  return <AddTaskModalForm onClose={onClose} onSubmit={onSubmit} caseTitles={caseTitles} />;
}

/* ─── Main Page ─── */

function sortTasksActiveFirst(list: Task[]) {
  const active = list.filter((t) => !t.done);
  const done = list.filter((t) => t.done);
  return [...active, ...done];
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function Home() {
  const isClient = useIsClient();
  const [tasks, setTasks] = useState<Task[]>(DEFAULT_TASKS);
  const [cases, setCases] = useState<CaseItem[]>(DEFAULT_CASES);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("home");
  const [activeProject, setActiveProject] = useState<string>(PROJECTS[0]);
  const [viewDateISO, setViewDateISO] = useState(() => todayISO());
  const [casesListOpen, setCasesListOpen] = useState(false);

  const viewDateLabel = formatDateJa(viewDateISO);
  const isAllProjects = activeProject === ALL_PROJECTS_LABEL;

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!isClient) return;
    try {
      const rawTasks = localStorage.getItem(STORAGE_KEY);
      if (rawTasks) {
        const parsed = JSON.parse(rawTasks) as Task[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setTasks(sortTasksActiveFirst(parsed.map((t) => normalizeTask(t))));
        }
      }
      const rawCases = localStorage.getItem(CASES_STORAGE_KEY);
      if (rawCases) {
        const parsed = JSON.parse(rawCases) as CaseItem[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setCases(parsed.map((c) => normalizeCase(c as CaseItem)));
        }
      }
    } catch { /* ignore */ }
  }, [isClient]);

  useEffect(() => {
    if (!isClient) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }, [tasks, isClient]);

  useEffect(() => {
    if (!isClient) return;
    localStorage.setItem(CASES_STORAGE_KEY, JSON.stringify(cases));
  }, [cases, isClient]);

  const viewDateTasks = useMemo(
    () => tasks.filter((t) => !isRangeTask(t) && t.date === viewDateISO),
    [tasks, viewDateISO],
  );
  const activeTasks = useMemo(() => viewDateTasks.filter((t) => !t.done), [viewDateTasks]);
  const completedTasks = useMemo(() => viewDateTasks.filter((t) => t.done), [viewDateTasks]);

  const incompleteOtherTasks = useMemo(() => {
    if (viewDateISO > todayISO()) {
      return [];
    }
    let list = tasks.filter(
      (t) => !t.done && !isRangeTask(t) && t.date < viewDateISO,
    );
    if (!isAllProjects) {
      list = list.filter((t) => t.project === activeProject);
    }
    return sortTasksActiveFirst(list);
  }, [tasks, viewDateISO, activeProject, isAllProjects]);

  const upcomingRangeTasks = useMemo(() => {
    let list = tasks.filter((t) => isActiveRangeTask(t, viewDateISO));
    if (!isAllProjects) {
      list = list.filter((t) => t.project === activeProject);
    }
    return list;
  }, [tasks, viewDateISO, activeProject, isAllProjects]);
  const ongoingCases = useMemo(
    () => cases.filter((c) => !c.done),
    [cases],
  );
  const completedCasesCount = useMemo(
    () => cases.filter((c) => c.done).length,
    [cases],
  );
  const caseGridDisplay = useMemo(
    () => getCaseGridDisplay(ongoingCases),
    [ongoingCases],
  );
  const openCasesList = useCallback(() => {
    setCasesListOpen(true);
    setMobileTab("home");
  }, []);
  const caseTitles = useMemo(
    () => ongoingCases.map((c) => c.title),
    [ongoingCases],
  );

  const displayedTasks = useMemo(() => {
    let list = viewDateTasks;
    if (!isAllProjects) {
      list = list.filter((t) => t.project === activeProject);
    }
    const active = list.filter((t) => !t.done);
    const done = list.filter((t) => t.done);
    return [...active, ...done];
  }, [viewDateTasks, activeProject, isAllProjects]);

  const goToDate = useCallback((iso: string) => {
    setViewDateISO(iso);
    setMobileTab("home");
  }, []);

  const reorderTasksInList = useCallback(
    (prev: Task[], visible: Task[], activeId: string | number, overId: string | number) => {
      const oldIndex = visible.findIndex((t) => t.id === activeId);
      const newIndex = visible.findIndex((t) => t.id === overId);
      if (oldIndex === -1 || newIndex === -1) return prev;

      const reordered = arrayMove(visible, oldIndex, newIndex);
      const visibleIds = new Set(visible.map((t) => t.id));
      let nextIdx = 0;
      return prev.map((t) => {
        if (!visibleIds.has(t.id)) return t;
        return reordered[nextIdx++]!;
      });
    },
    [],
  );

  const handleTaskDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setTasks((prev) => {
        let visible = prev.filter((t) => !isRangeTask(t) && t.date === viewDateISO);
        if (!isAllProjects) {
          visible = visible.filter((t) => t.project === activeProject);
        }
        return reorderTasksInList(prev, visible, active.id, over.id);
      });
    },
    [activeProject, isAllProjects, viewDateISO, reorderTasksInList],
  );

  const handleUpcomingTaskDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setTasks((prev) => {
        let visible = prev.filter((t) => isActiveRangeTask(t, viewDateISO));
        if (!isAllProjects) {
          visible = visible.filter((t) => t.project === activeProject);
        }
        return reorderTasksInList(prev, visible, active.id, over.id);
      });
    },
    [activeProject, isAllProjects, viewDateISO, reorderTasksInList],
  );

  const handleCaseDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setCases((prev) => {
      const ongoing = prev.filter((c) => !c.done);
      const completed = prev.filter((c) => c.done);
      const oldIndex = ongoing.findIndex((c) => c.id === active.id);
      const newIndex = ongoing.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return [...arrayMove(ongoing, oldIndex, newIndex), ...completed];
    });
  }, []);

  const addTask = useCallback((data: { title: string; project: string; time: string }) => {
    setTasks((prev) => [{
      id: uid(),
      title: data.title,
      time: data.time.includes("今日") ? data.time : `今日 ${data.time}`,
      date: viewDateISO,
      done: false,
      project: data.project,
    }, ...prev]);
  }, [viewDateISO]);

  const updateTask = useCallback(
    (id: string, data: { title: string; project: string; date: string; dateEnd?: string }) => {
      setTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next: Task = {
            ...t,
            title: data.title,
            project: data.project,
            date: data.date,
            dateEnd: data.dateEnd,
          };
          if (isRangeTask(next)) {
            next.time = `～${formatMonthDay(next.dateEnd!)}`;
          } else {
            next.time =
              data.date === todayISO()
                ? "今日"
                : data.date === tomorrowISO()
                  ? "明日"
                  : data.date.replace(/-/g, "/");
            next.dateEnd = undefined;
          }
          return normalizeTask(next);
        }),
      );
    },
    [],
  );

  const updateCase = useCallback(
    (
      id: string,
      data: {
        title: string;
        project: string;
        goal: string;
        status: string;
        statusTone: CaseItem["statusTone"];
        deadline: string;
      },
    ) => {
      setCases((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...data } : c)),
      );
    },
    [],
  );

  const toggleTask = useCallback((id: string) => {
    setTasks((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      const task = updated.find((t) => t.id === id);
      if (!task || isRangeTask(task)) return updated;
      return sortTasksByDateWithDoneLast(updated, task.date);
    });
  }, []);

  const addCase = useCallback((data: { title: string; project: string }) => {
    const status = STATUS_OPTIONS[Math.floor(Math.random() * STATUS_OPTIONS.length)];
    setCases((prev) => [
      {
        id: uidCase(),
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
      },
      ...prev,
    ]);
  }, []);

  const toggleCase = useCallback((id: string) => {
    setCases((prev) =>
      prev.map((c) => {
        if (c.id !== id) return c;
        const done = !c.done;
        return {
          ...c,
          done,
          completedAt: done ? formatCaseDate(new Date()) : null,
        };
      }),
    );
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }, []);

  if (!isClient) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }

  const renderTaskList = (
    list: Task[],
    dragScope: "today" | "upcoming" | "range",
    options?: { showOriginalDeadline?: boolean },
  ) => (
    <SortableTaskList
      list={list}
      sensors={sensors}
      onDragEnd={
        dragScope === "today"
          ? handleTaskDragEnd
          : dragScope === "upcoming"
            ? handleUpcomingTaskDragEnd
            : () => {}
      }
      onToggle={toggleTask}
      onDelete={deleteTask}
      onOpen={setSelectedTask}
      showOriginalDeadline={options?.showOriginalDeadline}
      sortable={dragScope === "today" || dragScope === "upcoming"}
    />
  );

  const showCases = mobileTab === "home" || mobileTab === "cases" || mobileTab === "projects";
  const showTasks = mobileTab === "home";

  return (
    <div className="min-h-screen bg-[#fafafa] font-[family-name:var(--font-geist-sans)] text-gray-900 antialiased">
      <div className="mx-auto flex min-h-screen max-w-[1480px]">
        {/* Left Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[168px] shrink-0 flex-col border-r border-black/[0.06] bg-white/70 px-3 py-5 backdrop-blur-xl lg:flex">
          <div className="mb-6 flex items-center gap-2 px-1">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#007AFF] text-[11px] font-bold text-white shadow-sm">行</div>
            <span className="text-[13px] font-semibold tracking-tight text-gray-900">行間</span>
          </div>

          <div className="mb-1.5 flex items-center justify-between px-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Projects</span>
            <button type="button" className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:bg-black/[0.04]" aria-label="追加">
              <Icon name="plus" className="h-3 w-3" />
            </button>
          </div>

          <nav className="flex-1 space-y-0.5 overflow-y-auto">
            {PROJECTS.map((p) => {
              const active = activeProject === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActiveProject(p)}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-all duration-200 ${
                    active
                      ? "bg-[#007AFF]/10 font-medium text-[#007AFF]"
                      : "text-gray-600 hover:bg-black/[0.03]"
                  }`}
                >
                  <Icon name={active ? "folderOpen" : "folder"} className={`h-3.5 w-3.5 shrink-0 ${active ? "text-[#007AFF]" : "text-gray-400"}`} />
                  <span className="truncate">{p === ALL_PROJECTS_LABEL ? "すべて" : p}</span>
                </button>
              );
            })}
          </nav>

          <button type="button" className="mt-3 flex w-full items-center gap-2 rounded-lg border border-black/[0.05] px-2 py-2 text-[11px] text-gray-500 transition-all duration-200 hover:bg-black/[0.02]">
            <Icon name="folder" className="h-3.5 w-3.5 text-gray-400" />
            完了済み
          </button>
        </aside>

        {/* Main + Right Panel */}
        <div className="flex min-w-0 flex-1">
        <main className="min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="mx-auto max-w-3xl px-2.5 py-2 sm:px-4 lg:max-w-none lg:px-5 lg:pb-2 lg:pt-2">
            {!casesListOpen && (
            <header className={`mb-2 lg:mb-3 ${showTasks ? "hidden lg:block" : ""}`}>
              <div className="mb-2 flex items-center justify-between lg:hidden">
                <button type="button" className="rounded-xl p-2 text-gray-500 hover:bg-white"><Icon name="menu" className="h-5 w-5" /></button>
                <span className="text-[14px] font-medium text-gray-900">{viewDateLabel}</span>
                <button type="button" className="rounded-xl p-2 text-gray-500 hover:bg-white"><Icon name="bell" className="h-5 w-5" /></button>
              </div>

              <div className="hidden flex-wrap items-center gap-3 lg:flex">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setViewDateISO((d) => shiftISODate(d, -1))}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-white"
                    aria-label="前の日"
                  >
                    <Icon name="chevronLeft" className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewDateISO((d) => shiftISODate(d, 1))}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-white"
                    aria-label="次の日"
                  >
                    <Icon name="chevronRight" className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-[15px] font-semibold text-gray-900">{viewDateLabel}</span>
              </div>
            </header>
            )}

            {casesListOpen ? (
              <CasesListSection
                cases={cases}
                onToggle={toggleCase}
                onOpen={setSelectedCase}
                onBack={() => setCasesListOpen(false)}
                sensors={sensors}
                onDragEnd={handleCaseDragEnd}
              />
            ) : (
              <>
            <div className="flex flex-col">
            {showTasks && (
              <section className="order-1 mb-3 lg:hidden">
                <MobileCalendarWidget
                  tasks={tasks}
                  selectedDate={viewDateISO}
                  onSelectDate={goToDate}
                  peekMode={viewDateISO === todayISO()}
                />
              </section>
            )}

            {showTasks && (
              <section className="order-2 mb-4 lg:order-3">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <h3 className="shrink-0 text-[17px] font-semibold tracking-tight text-gray-900">{taskSectionLabel(viewDateISO)}</h3>
                    <span className="text-[13px] text-gray-400">
                      未完了 {activeTasks.length}件 · 完了 {completedTasks.length}件
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskModalOpen(true)}
                    className="shrink-0 text-[13px] font-medium text-gray-400 transition-all duration-200 hover:text-[#007AFF]"
                  >
                    ＋ タスクを追加
                  </button>
                </div>

                <Card className="overflow-hidden p-1.5">
                  {displayedTasks.length === 0 && incompleteOtherTasks.length === 0 ? (
                    <div className="px-4 py-8 text-center">
                      <p className="text-[12px] text-gray-400">タスクがありません</p>
                    </div>
                  ) : (
                    <>
                      {displayedTasks.length > 0 && renderTaskList(displayedTasks, "today")}
                      {incompleteOtherTasks.length > 0 && (
                        <div className={displayedTasks.length > 0 ? "mt-2 border-t border-black/[0.04] pt-2" : ""}>
                          <div className="mb-1.5 flex items-center justify-between px-1">
                            <span className="text-[11px] font-medium text-gray-400">未完了のタスク</span>
                            <span className="text-[11px] text-gray-300">{incompleteOtherTasks.length}件</span>
                          </div>
                          {renderTaskList(incompleteOtherTasks, "range", { showOriginalDeadline: true })}
                        </div>
                      )}
                    </>
                  )}
                </Card>
              </section>
            )}

            {showTasks && upcomingRangeTasks.length > 0 && (
              <section className="order-4 mb-4 lg:order-4">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <h3 className="shrink-0 text-[17px] font-semibold tracking-tight text-gray-900">近日中対応タスク</h3>
                    <span className="text-[13px] text-gray-400">
                      未完了 {upcomingRangeTasks.filter((t) => !t.done).length}件
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTaskModalOpen(true)}
                    className="shrink-0 text-[13px] font-medium text-gray-400 transition-all duration-200 hover:text-[#007AFF]"
                  >
                    ＋ タスクを追加
                  </button>
                </div>
                <Card className="overflow-hidden p-1.5">
                  {renderTaskList(upcomingRangeTasks, "upcoming")}
                </Card>
              </section>
            )}

            {showCases && isAllProjects && (
              <section className="order-3 mb-3 lg:order-1 lg:mb-4">
                <div className="mb-2 flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-baseline gap-3">
                    <h3 className="shrink-0 text-[17px] font-semibold text-gray-900">進行中の案件</h3>
                    <span className="text-[13px] text-gray-400">
                      {ongoingCases.length}件のアクティブ案件
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      onClick={() => setCaseModalOpen(true)}
                      className="text-[13px] font-medium text-gray-400 transition-all duration-200 hover:text-[#007AFF]"
                    >
                      ＋ 案件を追加
                    </button>
                  </div>
                </div>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCorners}
                  onDragEnd={handleCaseDragEnd}
                >
                  <SortableContext
                    items={caseGridDisplay.visible.map((c) => c.id)}
                    strategy={rectSortingStrategy}
                  >
                    <div className="grid grid-cols-1 gap-2 lg:grid-cols-3 lg:grid-rows-3">
                      {caseGridDisplay.visible.map((c) => (
                        <SortableCaseCard
                          key={c.id}
                          item={c}
                          onToggle={toggleCase}
                          onOpen={setSelectedCase}
                          showProjectTag
                        />
                      ))}
                      {caseGridDisplay.hiddenCount > 0 && (
                        <OverflowCaseTile
                          count={caseGridDisplay.hiddenCount}
                          onClick={openCasesList}
                        />
                      )}
                    </div>
                  </SortableContext>
                </DndContext>
              </section>
            )}

            </div>

            {showCases && !isAllProjects && (
              <ProjectDetailSection
                project={activeProject}
                cases={cases}
                onToggleCase={toggleCase}
                onOpenCase={setSelectedCase}
              />
            )}

              </>
            )}

            {!casesListOpen && mobileTab === "more" && (
              <section className="space-y-4">
                <Card className="p-6">
                  <h3 className="mb-4 text-[15px] font-semibold">設定</h3>
                  <ul className="space-y-2">
                    {[["通知", "オン"], ["データ保存", "localStorage"], ["テーマ", "ライト"]].map(([k, v]) => (
                      <li key={k} className="flex justify-between rounded-2xl bg-gray-50/80 px-4 py-3 text-[13px]">
                        <span className="text-gray-600">{k}</span>
                        <span className="font-medium text-gray-400">{v}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                <Card className="p-6">
                  <MonthlyStats activeCases={ongoingCases.length} completedCases={completedCasesCount} activeTasks={activeTasks.length} completedTasks={completedTasks.length} />
                </Card>
              </section>
            )}
          </div>
        </main>

        {/* Right Panel - calendar and stats */}
        <aside className="hidden w-[280px] shrink-0 self-start border-l border-black/[0.06] bg-white/40 px-4 py-3 backdrop-blur-xl lg:block">
          <Card className="mb-4 p-4">
            <CalendarWidget
              key={viewDateISO.slice(0, 7)}
              tasks={tasks}
              selectedDate={viewDateISO}
              onSelectDate={goToDate}
            />
          </Card>
          <Card className="p-6">
            <h3 className="mb-5 text-sm font-semibold text-gray-900">今月の状況</h3>
            <MonthlyStats
              activeCases={ongoingCases.length}
              completedCases={completedCasesCount}
              activeTasks={activeTasks.length}
              completedTasks={completedTasks.length}
            />
          </Card>
        </aside>
        </div>
      </div>

      {/* Mobile Tab Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-black/[0.06] bg-white/80 backdrop-blur-2xl lg:hidden">
        <div className="mx-auto flex max-w-lg justify-around px-1" style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}>
          {([
            { id: "home" as const, label: "ホーム", icon: "home" },
            { id: "cases" as const, label: "案件", icon: "cases" },
            { id: "projects" as const, label: "プロジェクト", icon: "folder" },
            { id: "more" as const, label: "その他", icon: "more" },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "cases") {
                  openCasesList();
                } else {
                  setCasesListOpen(false);
                  setMobileTab(tab.id);
                }
              }}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2.5 transition-all duration-200 ${
                (tab.id === "cases" ? casesListOpen : mobileTab === tab.id)
                  ? "text-blue-500"
                  : "text-gray-400"
              }`}
            >
              <Icon name={tab.icon} className="h-5 w-5" />
              <span className="text-[10px] font-medium">{tab.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* FAB */}
      <button
        type="button"
        onClick={() => setTaskModalOpen(true)}
        className="fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/35 transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95 lg:hidden"
        style={{ right: "1.25rem", bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
        aria-label="タスクを追加"
      >
        <Icon name="plus" className="h-6 w-6" />
      </button>

      <AddTaskModal
        open={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        onSubmit={addTask}
        caseTitles={caseTitles.length > 0 ? caseTitles : ["未入力"]}
      />
      <AddCaseModal
        open={caseModalOpen}
        onClose={() => setCaseModalOpen(false)}
        onSubmit={addCase}
      />

      <DetailOverlay
        open={!!selectedCase}
        onClose={() => setSelectedCase(null)}
        title="案件を編集"
      >
        {selectedCase && (
          <CaseDetailEditor
            key={selectedCase.id}
            item={selectedCase}
            onSave={updateCase}
            onClose={() => setSelectedCase(null)}
          />
        )}
      </DetailOverlay>

      <DetailOverlay
        open={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        title="タスクを編集"
      >
        {selectedTask && (
          <TaskDetailEditor
            key={selectedTask.id}
            item={selectedTask}
            onSave={updateTask}
            onClose={() => setSelectedTask(null)}
          />
        )}
      </DetailOverlay>
    </div>
  );
}
