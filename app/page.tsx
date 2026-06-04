"use client";

import {
  ALL_PROJECTS_LABEL,
  DEFAULT_PROJECT_ACCENT,
  DEFAULT_PROJECT_NAMES,
} from "@/lib/gyokan/constants";
import {
  memoDraftId,
  readDraft,
  clearDraft,
  type CaseDraftFields,
  type MemoDraftFields,
  type TaskDraftFields,
} from "@/lib/gyokan/drafts";
import { useAutosaveForm } from "@/lib/gyokan/use-autosave-form";
import {
  parseCaseCreatedAt,
  sortCasesByProjectOrder,
  sortTasksInCase,
} from "@/lib/gyokan/case-order";
import {
  caseSelectLabel,
  pickDefaultCaseId,
  taskBelongsToProject,
} from "@/lib/gyokan/task-case";
import { useGyokanData } from "@/lib/gyokan/use-gyokan-data";
import { useRouter } from "next/navigation";
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
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type PointerEvent,
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
  caseId?: string;
  starred?: boolean;
  sortOrder: number;
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
  sortOrder: number;
};

type ProjectMemo = {
  id: string;
  project: string;
  date: string;
  body: string;
};

type DailyMemo = {
  id: string;
  date: string;
  body: string;
  createdAt: string;
};

type SidebarProject = {
  id: string;
  name: string;
};

type MobileTab = "home" | "cases" | "projects" | "memo" | "more";

/* ─── Constants ─── */

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

const PROJECT_OPTIONS_FALLBACK = [...DEFAULT_PROJECT_NAMES];
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

type ProjectColorStyle = {
  accent: string;
  bg: string;
  text: string;
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return null;
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function hexToHsl(hex: string): [number, number, number] {
  const rgb = hexToRgb(hex);
  if (!rgb) return [217, 91, 59];
  return rgbToHsl(...rgb);
}

function hslToHex(h: number, s: number, l: number) {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c; g = x;
  } else if (h < 120) {
    r = x; g = c;
  } else if (h < 180) {
    g = c; b = x;
  } else if (h < 240) {
    g = x; b = c;
  } else if (h < 300) {
    r = x; b = c;
  } else {
    r = c; b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function isValidAccentHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function projectColorFromAccent(accent: string): ProjectColorStyle {
  const normalized = isValidAccentHex(accent) ? accent.toUpperCase() : DEFAULT_PROJECT_ACCENT;
  const [h, s, l] = hexToHsl(normalized);
  return {
    accent: normalized,
    bg: hslToHex(h, Math.min(s, 38), 93),
    text: hslToHex(h, Math.max(s, 45), Math.max(l - 18, 22)),
  };
}

function getProjectColor(accentHex: string | undefined): ProjectColorStyle {
  if (accentHex && isValidAccentHex(accentHex)) {
    return projectColorFromAccent(accentHex);
  }
  return projectColorFromAccent(DEFAULT_PROJECT_ACCENT);
}

type ProjectColorsContextValue = {
  colors: Record<string, string>;
  setProjectColor: (project: string, accent: string) => void;
  projectOptions: string[];
  cases: CaseItem[];
  ongoingCases: CaseItem[];
  caseTitleById: Record<string, string>;
};

const ProjectColorsContext = createContext<ProjectColorsContextValue>({
  colors: {},
  setProjectColor: () => {},
  projectOptions: [...PROJECT_OPTIONS_FALLBACK],
  cases: [],
  ongoingCases: [],
  caseTitleById: {},
});

function useProjectColors() {
  return useContext(ProjectColorsContext);
}

/* ─── Helpers ─── */

function formatCaseDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function sortProjectCases(list: CaseItem[]) {
  return [...list].sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return parseCaseCreatedAt(a.createdAt) - parseCaseCreatedAt(b.createdAt);
  });
}

type ProjectTimelineEntry =
  | { kind: "case"; caseItem: CaseItem; sortDate: number; done: boolean }
  | { kind: "memo"; memo: ProjectMemo; sortDate: number };

function buildProjectTimeline(
  project: string,
  cases: CaseItem[],
  memos: ProjectMemo[],
): ProjectTimelineEntry[] {
  const entries: ProjectTimelineEntry[] = [
    ...cases
      .filter((c) => c.project === project)
      .map((c) => ({
        kind: "case" as const,
        caseItem: c,
        sortDate: parseCaseCreatedAt(c.createdAt),
        done: c.done,
      })),
    ...memos
      .filter((m) => m.project === project)
      .map((m) => ({
        kind: "memo" as const,
        memo: m,
        sortDate: parseCaseCreatedAt(m.date),
      })),
  ];

  return entries.sort((a, b) => {
    const aDone = a.kind === "case" ? a.done : false;
    const bDone = b.kind === "case" ? b.done : false;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return a.sortDate - b.sortDate;
  });
}

function normalizeMemo(item: ProjectMemo): ProjectMemo {
  return {
    ...item,
    date: item.date ?? formatCaseDate(new Date()),
    body: item.body ?? "",
  };
}

function formatCaseDateForInput(date: string) {
  return date.replace(/\./g, "-").replace(/\//g, "-");
}

function parseMemoDateInput(value: string) {
  if (!value) return formatCaseDate(new Date());
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return formatCaseDate(new Date());
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
    sortOrder: item.sortOrder ?? 0,
  };
}

function normalizeTask(item: Task): Task {
  const date = item.date ?? todayISO();
  return {
    ...item,
    date,
    dateEnd: item.dateEnd && item.dateEnd !== date ? item.dateEnd : undefined,
    sortOrder: item.sortOrder ?? 0,
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

function formatTaskTimeLabel(date: string) {
  if (date === todayISO()) return "今日";
  if (date === tomorrowISO()) return "明日";
  return date.replace(/-/g, "/");
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
  if (isToday && inMonth) return "bg-blue-100 text-blue-600";
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

function tagColor(project: string, colors: Record<string, string>) {
  return getProjectColor(colors[project]);
}

function truncateTagText(text: string, maxLen = 5) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
}

function CaseNameTag({
  caseId,
  muted,
}: {
  caseId?: string;
  muted?: boolean;
}) {
  const { colors, caseTitleById, cases } = useProjectColors();
  if (!caseId) return null;
  const title = caseTitleById[caseId];
  if (!title) return null;
  const project = cases.find((c) => c.id === caseId)?.project ?? "";
  const color = tagColor(project, colors);
  return (
    <span
      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium"
      style={
        muted
          ? { backgroundColor: "#f3f4f6", color: "#9ca3af" }
          : { backgroundColor: color.bg, color: color.text }
      }
    >
      {truncateTagText(title)}
    </span>
  );
}

function ProjectNameTag({ name, muted }: { name: string; muted?: boolean }) {
  const { colors } = useProjectColors();
  const color = tagColor(name, colors);
  return (
    <span
      className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium"
      style={
        muted
          ? { backgroundColor: "rgba(156, 163, 175, 0.35)", color: "rgb(229, 231, 235)" }
          : { backgroundColor: color.bg, color: color.text }
      }
      title={name}
    >
      {truncateTagText(name)}
    </span>
  );
}

function ProjectColorSwatch({
  accent,
  size = "md",
  selected = false,
  onClick,
}: {
  accent?: string;
  size?: "sm" | "md";
  selected?: boolean;
  onClick?: () => void;
}) {
  const color = getProjectColor(accent);
  const dim = size === "sm" ? "h-4 w-4" : "h-7 w-7";
  const Tag = onClick ? "button" : "span";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      aria-label={onClick ? "プロジェクトカラー" : undefined}
      onClick={onClick}
      className={`${dim} shrink-0 rounded-full ${onClick ? "transition-transform hover:scale-110" : ""} ${
        selected ? "ring-2 ring-[#007AFF] ring-offset-2" : ""
      }`}
      style={{ backgroundColor: color.accent }}
    />
  );
}

const COLOR_MAP_LIGHTNESS_MIN = 20;
const COLOR_MAP_LIGHTNESS_MAX = 85;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ProjectColorPickerModal({
  open,
  onClose,
  project,
  accent,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  project: string;
  accent?: string;
  onSave: (accent: string) => void;
}) {
  const mapRef = useRef<HTMLDivElement>(null);
  const draggingMap = useRef(false);
  const [hue, setHue] = useState(217);
  const [sat, setSat] = useState(91);
  const [light, setLight] = useState(59);

  useEffect(() => {
    if (!open) return;
    const [h, s, l] = hexToHsl(accent ?? DEFAULT_PROJECT_ACCENT);
    setHue(h);
    setSat(s);
    setLight(l);
  }, [open, accent]);

  const previewAccent = hslToHex(hue, sat, light);
  const previewStyle = getProjectColor(previewAccent);
  const mapX = sat;
  const mapY =
    ((COLOR_MAP_LIGHTNESS_MAX - light) / (COLOR_MAP_LIGHTNESS_MAX - COLOR_MAP_LIGHTNESS_MIN)) * 100;

  const updateFromMap = useCallback((clientX: number, clientY: number) => {
    const el = mapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clamp((clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((clientY - rect.top) / rect.height, 0, 1);
    setSat(Math.round(x * 100));
    setLight(
      Math.round(COLOR_MAP_LIGHTNESS_MAX - y * (COLOR_MAP_LIGHTNESS_MAX - COLOR_MAP_LIGHTNESS_MIN)),
    );
  }, []);

  const onMapPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    draggingMap.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    updateFromMap(e.clientX, e.clientY);
  };

  const onMapPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!draggingMap.current) return;
    updateFromMap(e.clientX, e.clientY);
  };

  const onMapPointerUp = () => {
    draggingMap.current = false;
  };

  return (
    <DetailOverlay open={open} onClose={onClose} title="プロジェクトカラー">
      <p className="mb-4 text-[13px] text-gray-500">{project}</p>

      <div
        ref={mapRef}
        className="relative mb-4 h-44 w-full cursor-crosshair touch-none overflow-hidden rounded-2xl ring-1 ring-black/[0.08]"
        style={{
          background: `linear-gradient(to bottom, transparent, #000), linear-gradient(to right, #fff, ${hslToHex(hue, 100, 50)})`,
        }}
        onPointerDown={onMapPointerDown}
        onPointerMove={onMapPointerMove}
        onPointerUp={onMapPointerUp}
        onPointerCancel={onMapPointerUp}
      >
        <div
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/25"
          style={{ left: `${mapX}%`, top: `${mapY}%`, backgroundColor: previewAccent }}
        />
      </div>

      <div className="mb-5">
        <label className="mb-1.5 block text-[11px] font-medium text-gray-400">色相</label>
        <input
          type="range"
          min={0}
          max={360}
          value={hue}
          onChange={(e) => setHue(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full"
          style={{
            background:
              "linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)",
          }}
        />
      </div>

      <div className="mb-6">
        <label className="mb-1.5 block text-[11px] font-medium text-gray-400">明るさ</label>
        <input
          type="range"
          min={COLOR_MAP_LIGHTNESS_MIN}
          max={COLOR_MAP_LIGHTNESS_MAX}
          value={light}
          onChange={(e) => setLight(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-full bg-gradient-to-r from-black via-current to-white"
          style={{ color: hslToHex(hue, sat, 50) }}
        />
      </div>

      <div className="mb-6 flex items-center gap-3 rounded-xl bg-gray-50/80 px-3 py-2.5">
        <ProjectColorSwatch accent={previewAccent} />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-gray-700">プレビュー</p>
          <p className="truncate text-[11px] text-gray-400">{previewAccent}</p>
        </div>
        <span
          className="shrink-0 rounded-md px-2 py-0.5 text-[10px] font-medium"
          style={{ backgroundColor: previewStyle.bg, color: previewStyle.text }}
        >
          {truncateTagText(project, 8)}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-black/[0.08] py-2.5 text-[14px] font-medium text-gray-600 hover:bg-gray-50"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => {
            onSave(previewAccent);
            onClose();
          }}
          className="flex-1 rounded-xl bg-[#007AFF] py-2.5 text-[14px] font-medium text-white hover:bg-[#0066DD]"
        >
          保存
        </button>
      </div>
    </DetailOverlay>
  );
}

function ProjectColorHeaderLink({ project }: { project: string }) {
  const { colors, setProjectColor } = useProjectColors();
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const projectAccent = colors[project];

  return (
    <>
      <button
        type="button"
        onClick={() => setColorPickerOpen(true)}
        className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#007AFF] hover:text-[#0066DD] sm:text-[13px]"
      >
        <ProjectColorSwatch accent={projectAccent} size="sm" />
        プロジェクトカラーを選択
      </button>
      <ProjectColorPickerModal
        open={colorPickerOpen}
        onClose={() => setColorPickerOpen(false)}
        project={project}
        accent={projectAccent}
        onSave={(accent) => setProjectColor(project, accent)}
      />
    </>
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
    memo: <svg {...p}><path d="M8 4h8a2 2 0 0 1 2 2v12l-4-3H8a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" /><path d="M12 11h4M12 15h4M8 11h.01M8 15h.01" /></svg>,
    bell: <svg {...p}><path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16l-2-2" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>,
    refresh: (
      <svg {...p}>
        <path d="M4 12a8 8 0 0 1 13.7-5.7" />
        <path d="M20 4v5h-5" />
        <path d="M20 12a8 8 0 0 1-13.7 5.7" />
        <path d="M4 20v-5h5" />
      </svg>
    ),
    x: <svg {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>,
    trash: <svg {...p}><path d="M4 7h16M9 7V5h6v2M10 11v6M14 11v6M6 7l1 13h10l1-13" /></svg>,
  };

  return map[name] ?? null;
}

function reloadApp(onRefresh?: () => Promise<void>) {
  if (onRefresh) {
    void onRefresh();
    return;
  }
  window.location.reload();
}

function RefreshButton({
  className = "",
  iconClassName = "h-5 w-5",
  label = "更新",
  onRefresh,
}: {
  className?: string;
  iconClassName?: string;
  label?: string;
  onRefresh?: () => Promise<void>;
}) {
  const [spinning, setSpinning] = useState(false);

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => {
        setSpinning(true);
        void (async () => {
          try {
            if (onRefresh) await onRefresh();
            else reloadApp();
          } finally {
            setTimeout(() => setSpinning(false), 600);
          }
        })();
      }}
      className={`rounded-xl p-2 text-gray-500 transition-colors hover:bg-white hover:text-[#007AFF] ${className}`}
    >
      <Icon
        name="refresh"
        className={`${iconClassName}${spinning ? " animate-spin" : ""}`}
      />
    </button>
  );
}

const PULL_REFRESH_THRESHOLD = 64;
const PULL_REFRESH_MAX = 96;

function PullToRefresh({
  enabled,
  onRefresh,
}: {
  enabled: boolean;
  onRefresh?: () => Promise<void>;
}) {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const touchStartY = useRef(0);
  const dragging = useRef(false);
  const pullDistanceRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const getScrollTop = () =>
      window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;

    const reset = () => {
      dragging.current = false;
      pullDistanceRef.current = 0;
      setPullDistance(0);
    };

    const onTouchStart = (e: TouchEvent) => {
      if ((e.target as Element).closest("[data-mobile-calendar]")) {
        dragging.current = false;
        return;
      }
      if (refreshing || getScrollTop() > 2) return;
      touchStartY.current = e.touches[0]?.clientY ?? 0;
      dragging.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if ((e.target as Element).closest("[data-mobile-calendar]")) return;
      if (!dragging.current || refreshing) return;
      if (getScrollTop() > 2) {
        reset();
        return;
      }

      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - touchStartY.current;
      if (delta <= 0) {
        pullDistanceRef.current = 0;
        setPullDistance(0);
        return;
      }

      const next = Math.min(delta * 0.5, PULL_REFRESH_MAX);
      pullDistanceRef.current = next;
      setPullDistance(next);
      if (delta > 10) e.preventDefault();
    };

    const onTouchEnd = () => {
      if (!dragging.current) return;
      dragging.current = false;

      if (pullDistanceRef.current >= PULL_REFRESH_THRESHOLD) {
        setRefreshing(true);
        pullDistanceRef.current = PULL_REFRESH_THRESHOLD;
        setPullDistance(PULL_REFRESH_THRESHOLD);
        void (async () => {
          try {
            if (onRefresh) await onRefresh();
            else reloadApp();
          } finally {
            setRefreshing(false);
            reset();
          }
        })();
        return;
      }

      reset();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enabled, refreshing, onRefresh]);

  if (!enabled || pullDistance <= 0) return null;

  const ready = pullDistance >= PULL_REFRESH_THRESHOLD;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center lg:hidden"
      style={{ top: `calc(${Math.max(8, pullDistance - 28)}px + env(safe-area-inset-top, 0px))` }}
    >
      <div
        className={`flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 shadow-md ring-1 ring-black/[0.06] backdrop-blur-sm ${
          refreshing ? "animate-pulse" : ""
        }`}
      >
        <Icon
          name="refresh"
          className={`h-4 w-4 text-[#007AFF] ${refreshing || ready ? "animate-spin" : ""}`}
        />
        <span className="text-[12px] font-medium text-gray-600">
          {refreshing ? "更新中…" : ready ? "離して更新" : "引っ張って更新"}
        </span>
      </div>
    </div>
  );
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
  layout = "modal",
  caseTasks,
  onAddTask,
  onToggleTask,
  onOpenTask,
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
  ) => void | boolean | Promise<void | boolean>;
  onClose?: () => void;
  layout?: "modal" | "page";
  caseTasks?: Task[];
  onAddTask?: () => void;
  onToggleTask?: (id: string) => void;
  onOpenTask?: (task: Task) => void;
}) {
  const { projectOptions } = useProjectColors();
  const itemIdRef = useRef(item.id);

  const loadCaseFields = useCallback((source: CaseItem): CaseDraftFields => ({
    title: source.title,
    project: source.project,
    goal: source.goal,
    status: source.status,
    statusTone: source.statusTone,
    deadline: formatCaseDeadlineForInput(source.deadline),
  }), []);

  const [title, setTitle] = useState(() => readDraft<CaseDraftFields>("case", item.id)?.title ?? item.title);
  const [project, setProject] = useState(() => readDraft<CaseDraftFields>("case", item.id)?.project ?? item.project);
  const [goal, setGoal] = useState(() => readDraft<CaseDraftFields>("case", item.id)?.goal ?? item.goal);
  const [status, setStatus] = useState(() => readDraft<CaseDraftFields>("case", item.id)?.status ?? item.status);
  const [deadline, setDeadline] = useState(
    () => readDraft<CaseDraftFields>("case", item.id)?.deadline ?? formatCaseDeadlineForInput(item.deadline),
  );

  useEffect(() => {
    if (item.id === itemIdRef.current) return;
    itemIdRef.current = item.id;
    const draft = readDraft<CaseDraftFields>("case", item.id);
    const next = draft ?? loadCaseFields(item);
    setTitle(next.title);
    setProject(next.project);
    setGoal(next.goal);
    setStatus(next.status);
    setDeadline(next.deadline);
  }, [item, loadCaseFields]);

  const formValues = useMemo((): CaseDraftFields => ({
    title,
    project,
    goal,
    status,
    statusTone: STATUS_OPTIONS.find((s) => s.label === status)?.tone ?? item.statusTone,
    deadline,
  }), [title, project, goal, status, deadline, item.statusTone]);

  const formBaseline = useMemo(() => loadCaseFields(item), [item, loadCaseFields]);

  const persistCase = useCallback((values: CaseDraftFields) => {
    if (!values.title.trim()) return false;
    return onSave(item.id, {
      title: values.title.trim(),
      project: values.project,
      goal: values.goal.trim(),
      status: values.status,
      statusTone: values.statusTone,
      deadline: parseCaseDeadlineInput(values.deadline),
    });
  }, [onSave, item.id]);

  useAutosaveForm({
    kind: "case",
    entityId: item.id,
    values: formValues,
    baseline: formBaseline,
    onPersist: persistCase,
  });

  const save = useCallback(() => {
    if (!title.trim()) return;
    persistCase(formValues);
    onClose?.();
  }, [title, formValues, persistCase, onClose]);

  return (
    <div>
      {layout === "page" && (
        <>
          <DetailField label="発生日">
            <p className="text-[14px] text-gray-900">{item.createdAt}</p>
          </DetailField>
          {item.done && item.completedAt && (
            <DetailField label="完了日">
              <p className="text-[14px] text-gray-900">{item.completedAt}</p>
            </DetailField>
          )}
        </>
      )}
      <DetailField label="案件名">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldInputClass} />
      </DetailField>
      <DetailField label="プロジェクト">
        <select value={project} onChange={(e) => setProject(e.target.value)} className={fieldInputClass}>
          {projectOptions.map((p) => (
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
      {layout === "page" && (
        <div className="mt-1">
          {caseTasks && caseTasks.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {caseTasks.map((task) => (
                <div
                  key={task.id}
                  onClick={() => onOpenTask?.(task)}
                  className={`group flex cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-all duration-200 ${
                    task.done
                      ? "border-black/[0.05] bg-black/[0.02] opacity-70"
                      : "border-black/[0.05] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleTask?.(task.id);
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
                      task.done ? "text-gray-400 line-through" : "text-gray-900"
                    }`}
                  >
                    {task.title}
                  </p>
                  <span className="shrink-0 text-[10px] text-gray-400">{formatTaskPeriod(task)}</span>
                </div>
              ))}
            </div>
          )}
          {onAddTask && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onAddTask}
                className="text-[13px] font-medium text-gray-400 transition-all duration-200 hover:text-[#007AFF]"
              >
                ＋ タスクを追加
              </button>
            </div>
          )}
        </div>
      )}
      <div className={`flex gap-2 ${layout === "page" ? "mt-5 justify-end" : "mt-5 justify-end"}`}>
        {layout === "modal" && onClose && (
          <button type="button" onClick={onClose} className="rounded-xl px-4 py-2 text-[13px] font-medium text-gray-500 hover:bg-black/[0.04]">キャンセル</button>
        )}
        {layout === "modal" && (
          <button type="button" onClick={save} className="rounded-xl bg-[#007AFF] px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-600">保存</button>
        )}
        {layout === "page" && (
          <p className="text-[11px] text-gray-300">入力内容は自動保存されます</p>
        )}
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
  onSave: (
    id: string,
    data: {
      title: string;
      caseId: string;
      date: string;
      dateEnd?: string;
      project?: string;
    },
  ) => void | boolean | Promise<void | boolean>;
  onClose: () => void;
}) {
  const itemIdRef = useRef(item.id);
  const { ongoingCases, cases, projectOptions } = useProjectColors();

  const caseOptions = useMemo(() => {
    const list = [...ongoingCases];
    if (item.caseId && !list.some((c) => c.id === item.caseId)) {
      const current = cases.find((c) => c.id === item.caseId);
      if (current) list.unshift(current);
    }
    return list;
  }, [ongoingCases, cases, item.caseId]);

  const loadTaskFields = useCallback((source: Task): TaskDraftFields => ({
    title: source.title,
    caseId: source.caseId ?? "",
    date: source.date,
    dateEnd: source.dateEnd ?? "",
    useRange: isRangeTask(source),
  }), []);

  const initialDraft = readDraft<TaskDraftFields>("task", item.id);
  const [title, setTitle] = useState(initialDraft?.title ?? item.title);
  const [underProjectDirect, setUnderProjectDirect] = useState(
    () => !(initialDraft?.caseId ?? item.caseId),
  );
  const [project, setProject] = useState(item.project);
  const [caseId, setCaseId] = useState(
    initialDraft?.caseId ?? item.caseId ?? "",
  );
  const [date, setDate] = useState(initialDraft?.date ?? item.date);
  const [dateEnd, setDateEnd] = useState(initialDraft?.dateEnd ?? item.dateEnd ?? "");
  const [useRange, setUseRange] = useState(initialDraft?.useRange ?? isRangeTask(item));

  useEffect(() => {
    if (item.id === itemIdRef.current) return;
    itemIdRef.current = item.id;
    const draft = readDraft<TaskDraftFields>("task", item.id);
    const next = draft ?? loadTaskFields(item);
    setTitle(next.title);
    setUnderProjectDirect(!next.caseId);
    setProject(item.project);
    setCaseId(next.caseId);
    setDate(next.date);
    setDateEnd(next.dateEnd ?? "");
    setUseRange(next.useRange);
  }, [item, loadTaskFields]);

  const formValues = useMemo((): TaskDraftFields => ({
    title,
    caseId,
    date,
    dateEnd,
    useRange,
  }), [title, caseId, date, dateEnd, useRange]);

  const formBaseline = useMemo((): TaskDraftFields => ({
    title: item.title,
    caseId: item.caseId ?? "",
    date: item.date,
    dateEnd: item.dateEnd ?? "",
    useRange: isRangeTask(item),
  }), [item]);

  const persistTask = useCallback(
    (values: TaskDraftFields, direct: boolean, projectName: string) => {
      if (!values.title.trim()) return false;
      if (!direct && !values.caseId) return false;
      if (direct && !projectName.trim()) return false;
      const end =
        values.useRange && values.dateEnd && values.dateEnd !== values.date
          ? values.dateEnd
          : undefined;
      return onSave(item.id, {
        title: values.title.trim(),
        caseId: direct ? "" : values.caseId,
        date: values.date,
        dateEnd: end,
        project: direct ? projectName : undefined,
      });
    },
    [onSave, item.id],
  );

  useAutosaveForm({
    kind: "task",
    entityId: item.id,
    values: formValues,
    baseline: formBaseline,
    onPersist: (values) => persistTask(values, underProjectDirect, project),
  });

  const save = () => {
    if (!title.trim()) return;
    persistTask(formValues, underProjectDirect, project);
    onClose();
  };

  return (
    <div>
      <DetailField label="タスク名">
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className={fieldInputClass} />
      </DetailField>
      <DetailField label="案件">
        <select
          value={caseId}
          onChange={(e) => setCaseId(e.target.value)}
          disabled={underProjectDirect}
          className={`${fieldInputClass} mb-2 ${
            underProjectDirect ? "cursor-not-allowed bg-gray-100 text-gray-400 opacity-60" : ""
          }`}
        >
          {caseOptions.length === 0 ? (
            <option value="">進行中の案件がありません</option>
          ) : (
            <>
              <option value="">案件を選択</option>
              {caseOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {caseSelectLabel(c)}
                </option>
              ))}
            </>
          )}
        </select>
        <label className="mb-2 flex cursor-pointer items-center gap-2 text-[13px] text-gray-600">
          <input
            type="checkbox"
            checked={underProjectDirect}
            onChange={(e) => {
              const checked = e.target.checked;
              setUnderProjectDirect(checked);
              if (checked) setCaseId("");
            }}
            className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-200"
          />
          プロジェクト直下
        </label>
        {underProjectDirect && (
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className={fieldInputClass}
          >
            {projectOptions.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        )}
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

function CaseDetailSection({
  item,
  onSave,
  onBack,
  onToggle,
  caseTasks,
  onAddTask,
  onToggleTask,
  onOpenTask,
  className = "",
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
  onBack: () => void;
  onToggle: (id: string) => void;
  caseTasks?: Task[];
  onAddTask?: () => void;
  onToggleTask?: (id: string) => void;
  onOpenTask?: (task: Task) => void;
  className?: string;
}) {
  return (
    <section className={`mb-8 lg:mb-10 ${className}`}>
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-gray-500 hover:bg-black/[0.04]"
          aria-label="プロジェクト詳細へ戻る"
        >
          <Icon name="chevronLeft" className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-semibold text-gray-900">{item.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-gray-400">
            <ProjectNameTag name={item.project} />
            {item.done ? (
              <span>完了</span>
            ) : (
              <StatusBadge label={item.status} tone={item.statusTone} />
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          aria-label={item.done ? "進行中に戻す" : "完了にする"}
          className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
            item.done
              ? "border-gray-400 bg-gray-500 text-white"
              : "border-gray-300 bg-white hover:border-blue-400"
          }`}
        >
          {item.done && <Icon name="check" className="h-2.5 w-2.5" />}
        </button>
      </div>
      <Card className="p-4">
        <CaseDetailEditor
          key={item.id}
          item={item}
          onSave={onSave}
          layout="page"
          caseTasks={caseTasks}
          onAddTask={onAddTask}
          onToggleTask={onToggleTask}
          onOpenTask={onOpenTask}
        />
      </Card>
    </section>
  );
}

function DetailCaseCard({
  item,
  onToggle,
  onOpen,
}: {
  item: CaseItem;
  onToggle: (id: string) => void;
  onOpen: (item: CaseItem) => void;
}) {
  const { colors } = useProjectColors();
  const accent = getProjectColor(colors[item.project]).accent;
  return (
    <article
      onClick={() => onOpen(item)}
      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-all duration-200 ${
        item.done
          ? "border-gray-200/80 bg-gray-200/70"
          : "border-gray-100 bg-white hover:bg-gray-50/80"
      }`}
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle(item.id);
        }}
        aria-label={item.done ? "進行中に戻す" : "完了にする"}
        className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-md border transition-all duration-200 ${
          item.done
            ? "border-gray-400 bg-gray-500 text-white"
            : "border-gray-300 bg-white hover:border-blue-400"
        }`}
      >
        {item.done && <Icon name="check" className="h-2 w-2" />}
      </button>
      <h4
        className={`min-w-0 flex-1 truncate text-[12px] font-medium leading-tight ${
          item.done ? "text-gray-400 line-through" : "text-gray-900"
        }`}
      >
        {item.title}
      </h4>
    </article>
  );
}

function DetailMemoCard({
  memo,
  onOpen,
}: {
  memo: ProjectMemo;
  onOpen: (memo: ProjectMemo) => void;
}) {
  const { colors } = useProjectColors();
  const accent = getProjectColor(colors[memo.project]).accent;
  return (
    <article
      onClick={() => onOpen(memo)}
      className="flex h-full min-h-[88px] cursor-pointer flex-col rounded-lg border border-amber-100 bg-amber-50/40 px-2.5 py-2 transition-all duration-200 hover:bg-amber-50/70"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <p className="mb-1 text-[10px] font-semibold text-amber-700/80">メモ</p>
      <p className="min-h-0 flex-1 text-[12px] leading-snug text-gray-800 line-clamp-4">{memo.body}</p>
      <p className="mt-auto text-[10px] text-gray-400">{memo.date}</p>
    </article>
  );
}

function ProjectMemoEditor({
  memo,
  project,
  onSave,
  onDelete,
  onClose,
}: {
  memo: ProjectMemo | null;
  project: string;
  onSave: (data: { date: string; body: string }) => void;
  onDelete?: () => void;
  onClose: () => void;
}) {
  const draftId = memoDraftId(memo, project);
  const draftIdRef = useRef(draftId);

  const loadMemoFields = useCallback((): MemoDraftFields => ({
    date: memo ? formatCaseDateForInput(memo.date) : todayISO(),
    body: memo?.body ?? "",
  }), [memo]);

  const [date, setDate] = useState(
    () => readDraft<MemoDraftFields>("memo", draftId)?.date ?? loadMemoFields().date,
  );
  const [body, setBody] = useState(
    () => readDraft<MemoDraftFields>("memo", draftId)?.body ?? loadMemoFields().body,
  );

  useEffect(() => {
    if (draftId === draftIdRef.current) return;
    draftIdRef.current = draftId;
    const draft = readDraft<MemoDraftFields>("memo", draftId);
    const next = draft ?? loadMemoFields();
    setDate(next.date);
    setBody(next.body);
  }, [draftId, loadMemoFields]);

  const formValues = useMemo((): MemoDraftFields => ({ date, body }), [date, body]);
  const formBaseline = useMemo(() => loadMemoFields(), [loadMemoFields]);

  const persistMemo = useCallback((values: MemoDraftFields) => {
    if (!values.body.trim()) return;
    onSave({ date: parseMemoDateInput(values.date), body: values.body.trim() });
  }, [onSave]);

  useAutosaveForm({
    kind: "memo",
    entityId: draftId,
    values: formValues,
    baseline: formBaseline,
    onPersist: persistMemo,
  });

  const save = () => {
    if (!body.trim()) return;
    persistMemo(formValues);
    onClose();
  };

  return (
    <div>
      <DetailField label="日付">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className={fieldInputClass}
        />
      </DetailField>
      <DetailField label="メモ">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          placeholder="メモを入力"
          className={`${fieldInputClass} resize-none`}
        />
      </DetailField>
      <div className="mt-5 flex items-center justify-between gap-2">
        {memo && onDelete ? (
          <button
            type="button"
            onClick={() => {
              onDelete();
              onClose();
            }}
            className="rounded-xl px-4 py-2 text-[13px] font-medium text-rose-500 hover:bg-rose-50"
          >
            削除
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl px-4 py-2 text-[13px] font-medium text-gray-500 hover:bg-black/[0.04]"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={save}
            className="rounded-xl bg-[#007AFF] px-4 py-2 text-[13px] font-medium text-white hover:bg-blue-600"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Project Detail ─── */

function MobileProjectList({
  projects,
  cases,
  onSelect,
}: {
  projects: readonly string[];
  cases: CaseItem[];
  onSelect: (name: string) => void;
}) {
  const { colors } = useProjectColors();
  return (
    <section className="mb-4 lg:hidden">
      <h3 className="mb-2 text-[17px] font-semibold tracking-tight text-gray-900">プロジェクト</h3>
      <Card className="overflow-hidden divide-y divide-black/[0.04] p-0">
        {projects.map((name) => {
          const activeCount = cases.filter((c) => c.project === name && !c.done).length;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(name)}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-black/[0.02]"
            >
              <ProjectColorSwatch accent={colors[name]} size="sm" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium text-gray-900">{name}</span>
              <span className="shrink-0 text-[13px] text-gray-400">進行中 {activeCount}件</span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
            </button>
          );
        })}
      </Card>
    </section>
  );
}

function ProjectDetailSection({
  project,
  cases,
  memos,
  onToggleCase,
  onOpenCase,
  onSaveMemo,
  onDeleteMemo,
  onAddCase,
  onBack,
  className = "",
}: {
  project: string;
  cases: CaseItem[];
  memos: ProjectMemo[];
  onToggleCase: (id: string) => void;
  onOpenCase: (item: CaseItem) => void;
  onSaveMemo: (data: { id?: string; project: string; date: string; body: string }) => void;
  onDeleteMemo: (id: string) => void;
  onAddCase?: () => void;
  onBack?: () => void;
  className?: string;
}) {
  const [memoModalOpen, setMemoModalOpen] = useState(false);
  const [editingMemo, setEditingMemo] = useState<ProjectMemo | null>(null);

  const projectCases = sortProjectCases(cases.filter((c) => c.project === project));
  const projectMemos = memos.filter((m) => m.project === project);
  const timeline = buildProjectTimeline(project, cases, memos);
  const active = projectCases.filter((c) => !c.done);
  const completed = projectCases.filter((c) => c.done);

  const openNewMemo = () => {
    setEditingMemo(null);
    setMemoModalOpen(true);
  };

  const openEditMemo = (memo: ProjectMemo) => {
    setEditingMemo(memo);
    setMemoModalOpen(true);
  };

  const closeMemoModal = () => {
    setMemoModalOpen(false);
    setEditingMemo(null);
  };

  return (
    <section className={`mb-8 lg:mb-10 ${className}`}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="プロジェクト一覧へ戻る"
              className="-ml-1 shrink-0 rounded-xl p-1.5 text-gray-500 hover:bg-black/[0.04] lg:hidden"
            >
              <Icon name="chevronLeft" className="h-5 w-5" />
            </button>
          )}
          <h3 className="text-[17px] font-semibold text-gray-900">{project}</h3>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-400">
        <span>進行中 {active.length}件</span>
        <span aria-hidden>·</span>
        <span>完了 {completed.length}件</span>
        {projectMemos.length > 0 && (
          <>
            <span aria-hidden>·</span>
            <span>メモ {projectMemos.length}件</span>
          </>
        )}
      </div>
      <div className="mb-2 flex items-center justify-between gap-4">
        <h4 className="shrink-0 text-[17px] font-semibold tracking-tight text-gray-900">案件一覧</h4>
        {onAddCase && (
          <button
            type="button"
            onClick={onAddCase}
            className="shrink-0 text-[13px] font-medium text-gray-400 transition-all duration-200 hover:text-[#007AFF]"
          >
            ＋ 案件を追加
          </button>
        )}
      </div>
      <Card className="overflow-hidden p-2">
        {timeline.length === 0 ? (
          <p className="px-2 py-6 text-center text-[13px] text-gray-400">
            このプロジェクトに紐づく案件はありません
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {timeline.map((entry) =>
              entry.kind === "case" ? (
                <DetailCaseCard
                  key={entry.caseItem.id}
                  item={entry.caseItem}
                  onToggle={onToggleCase}
                  onOpen={onOpenCase}
                />
              ) : (
                <DetailMemoCard
                  key={entry.memo.id}
                  memo={entry.memo}
                  onOpen={openEditMemo}
                />
              ),
            )}
          </div>
        )}
        <button
          type="button"
          onClick={openNewMemo}
          className={`flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-gray-50/50 px-3 py-3 text-[13px] font-medium text-gray-500 transition-colors hover:border-[#007AFF]/40 hover:bg-blue-50/40 hover:text-[#007AFF] ${
            timeline.length > 0 ? "mt-2" : ""
          }`}
        >
          メモ
        </button>
      </Card>

      <DetailOverlay
        open={memoModalOpen}
        onClose={closeMemoModal}
        title={editingMemo ? "メモを編集" : "メモを追加"}
      >
        <ProjectMemoEditor
          key={editingMemo?.id ?? `new-${project}`}
          memo={editingMemo}
          project={project}
          onSave={(data) => {
            onSaveMemo({
              id: editingMemo?.id,
              project,
              date: data.date,
              body: data.body,
            });
            if (!editingMemo) {
              clearDraft("memo", memoDraftId(null, project));
            }
          }}
          onDelete={
            editingMemo
              ? () => onDeleteMemo(editingMemo.id)
              : undefined
          }
          onClose={closeMemoModal}
        />
      </DetailOverlay>
    </section>
  );
}

function TodayTasksSection({
  viewDateISO,
  activeTaskCount,
  completedTaskCount,
  displayedTasks,
  incompleteOtherTasks,
  renderTaskList,
  onAddTask,
  className = "",
}: {
  viewDateISO: string;
  activeTaskCount: number;
  completedTaskCount: number;
  displayedTasks: Task[];
  incompleteOtherTasks: Task[];
  renderTaskList: (
    list: Task[],
    dragScope: "today" | "upcoming" | "range",
    options?: { showOriginalDeadline?: boolean },
  ) => ReactNode;
  onAddTask: () => void;
  className?: string;
}) {
  return (
    <section className={`mb-4 ${className}`}>
      <div className="mb-2 flex flex-nowrap items-center justify-between gap-2 overflow-hidden">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <h3 className="min-w-0 truncate text-[15px] font-semibold tracking-tight text-gray-900">
            {taskSectionLabel(viewDateISO)}
          </h3>
          <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-400">
            未完了{activeTaskCount}件·完了{completedTaskCount}件
          </span>
        </div>
        <button
          type="button"
          onClick={onAddTask}
          className="shrink-0 whitespace-nowrap text-[11px] font-medium text-gray-400 transition-all duration-200 hover:text-[#007AFF] sm:text-[13px]"
        >
          ＋タスク追加
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
      {task.caseId ? (
        <CaseNameTag caseId={task.caseId} muted={task.done} />
      ) : task.project ? (
        <ProjectNameTag name={task.project} muted={task.done} />
      ) : null}
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
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const grid = getCalendarGrid(year, month);
  const monthLabel = new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
  }).format(viewDate);
  const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

  const tasksByDate = useMemo(() => buildSingleDayTasksByDate(tasks), [tasks]);

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
          const cellIso = getGridCellIso(year, month, i);
          const isToday = cellIso === todayISO();
          const isSelected = cellIso === selectedDate;
          const hasTask = (tasksByDate.get(cellIso) ?? []).length > 0;
          const dayOfWeek = i % 7;

          return (
            <button
              key={`${i}-${cell.day}-${cell.inMonth}`}
              type="button"
              onClick={() => onSelectDate(cellIso)}
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

/** Selected day’s week plus one week before and after (3 weeks). */
function getPeekWeekStartIndex(selectedISO: string, year: number, month: number) {
  const selected = new Date(selectedISO + "T12:00:00");
  const weekStart = new Date(selected);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setDate(weekStart.getDate() - 7);
  const anchorISO = isoDate(weekStart);

  const grid = getCalendarGrid(year, month);
  for (let i = 0; i < grid.length; i++) {
    if (getGridCellIso(year, month, i) === anchorISO) {
      return Math.floor(i / 7) * 7;
    }
  }
  for (let i = 0; i < grid.length; i++) {
    if (getGridCellIso(year, month, i) >= anchorISO) {
      return Math.floor(i / 7) * 7;
    }
  }
  return 0;
}

function getMonthWeekCount(year: number, month: number) {
  return Math.ceil(getCalendarGrid(year, month).length / 7);
}

function getMonthIndexInRange(iso: string, months: { year: number; month: number }[]) {
  const d = new Date(iso + "T12:00:00");
  return months.findIndex(({ year, month }) => year === d.getFullYear() && month === d.getMonth());
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
  const { colors } = useProjectColors();
  const cellIso = getGridCellIso(year, month, cellIndex);
  const isSelected = cellIso === selectedDate;
  const isToday = cellIso === todayISO();
  const dayOfWeek = cellIndex % 7;
  const preview = dayTasks.slice(0, CALENDAR_TASK_PREVIEW_MAX);
  const overflow = Math.max(0, dayTasks.length - CALENDAR_TASK_PREVIEW_MAX);

  return (
    <button
      type="button"
      onClick={() => onSelect(cellIso)}
      className={`relative flex flex-col border-b border-r border-black/[0.04] p-0.5 text-left transition-colors ${mobileCalendarDayCellClass(dayOfWeek, cell.inMonth, isSelected, isToday)}`}
      style={{ height: CALENDAR_CELL_ROW_H, touchAction: "pan-x" }}
    >
      <span className="shrink-0 px-0.5 text-[11px] font-semibold leading-none">{cell.day}</span>
      {preview.length > 0 && (
        <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-px overflow-hidden">
          {preview.map((task, i) => {
            const taskColor = getProjectColor(colors[task.project]);
            return (
            <span
              key={task.id}
              className="relative truncate rounded-[2px] px-0.5 text-[8px] leading-[10px]"
              style={
                task.done
                  ? { backgroundColor: "rgba(229, 231, 235, 0.9)", color: "rgb(156, 163, 175)" }
                  : { backgroundColor: `${taskColor.accent}E6`, color: "#ffffff" }
              }
              title={task.title}
            >
              {truncateCalendarTaskTitle(task.title)}
              {overflow > 0 && i === preview.length - 1 && (
                <span className="absolute -bottom-px -right-px rounded-sm bg-gray-800 px-0.5 text-[7px] font-semibold leading-none text-white">
                  +{overflow}
                </span>
              )}
            </span>
            );
          })}
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
  const [peekEngaged, setPeekEngaged] = useState(!peekMode);
  const horizontalRef = useRef<HTMLDivElement>(null);
  const peekSuppressClickRef = useRef(false);
  const lastScrolledMonthRef = useRef<string | null>(null);
  const gestureStartMonthIdxRef = useRef(0);
  const gestureStartScrollLeftRef = useRef(0);
  const gestureDeltaXRef = useRef(0);

  const isPeek = peekMode && !peekEngaged;
  const PEEK_WEEKS = 3;
  const PEEK_GRID_H = CALENDAR_CELL_ROW_H * PEEK_WEEKS;
  const PEEK_HEADER_H = 58;
  const MONTH_PANEL_Y_PAD = 16;
  const PEEK_WRAP_H = PEEK_HEADER_H + PEEK_GRID_H + MONTH_PANEL_Y_PAD;
  const SWIPE_MONTH_THRESHOLD_PX = 8;
  const selectedMonthKey = selectedDate.slice(0, 7);

  const months = useMemo(() => buildMonthRange(selectedDate, 12, 12), [selectedDate]);
  const tasksByDate = useMemo(() => buildSingleDayTasksByDate(tasks), [tasks]);

  const selectedMonthIdx = useMemo(() => {
    const idx = getMonthIndexInRange(selectedDate, months);
    return idx >= 0 ? idx : 0;
  }, [selectedDate, months]);

  const [visibleMonthIdx, setVisibleMonthIdx] = useState(0);

  useLayoutEffect(() => {
    setVisibleMonthIdx(selectedMonthIdx);
  }, [selectedMonthIdx]);

  const getMonthIndexFromScroll = useCallback(() => {
    const strip = horizontalRef.current;
    if (!strip || strip.clientWidth <= 0) return 0;
    return Math.round(strip.scrollLeft / strip.clientWidth);
  }, []);

  const scrollToMonthIndex = useCallback(
    (idx: number, behavior: ScrollBehavior = "auto") => {
      const strip = horizontalRef.current;
      if (!strip || strip.clientWidth <= 0) return;
      const clamped = Math.max(0, Math.min(months.length - 1, idx));
      setVisibleMonthIdx(clamped);
      const left = clamped * strip.clientWidth;
      if (behavior === "smooth") {
        strip.scrollTo({ left, behavior: "smooth" });
      } else {
        strip.scrollLeft = left;
      }
    },
    [months.length],
  );

  const scrollToMonth = useCallback(
    (iso: string, behavior: ScrollBehavior = "auto") => {
      const idx = getMonthIndexInRange(iso, months);
      if (idx < 0) return;
      scrollToMonthIndex(idx, behavior);
    },
    [months, scrollToMonthIndex],
  );

  const resolveGestureTargetMonth = useCallback(() => {
    const strip = horizontalRef.current;
    if (!strip) return gestureStartMonthIdxRef.current;

    const startIdx = gestureStartMonthIdxRef.current;
    const touchDx = gestureDeltaXRef.current;
    const scrollDelta = strip.scrollLeft - gestureStartScrollLeftRef.current;

    let dir = 0;
    if (Math.abs(touchDx) >= SWIPE_MONTH_THRESHOLD_PX) {
      dir = touchDx > 0 ? 1 : -1;
    } else if (Math.abs(scrollDelta) >= SWIPE_MONTH_THRESHOLD_PX) {
      dir = scrollDelta > 0 ? 1 : -1;
    } else if (touchDx !== 0 || scrollDelta !== 0) {
      dir = (touchDx || scrollDelta) > 0 ? 1 : -1;
    }

    if (dir === 0) return startIdx;

    const targetIdx = Math.max(
      0,
      Math.min(months.length - 1, Math.max(startIdx - 1, Math.min(startIdx + 1, startIdx + dir))),
    );
    return targetIdx;
  }, [months.length]);

  const snapToGestureMonth = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      scrollToMonthIndex(resolveGestureTargetMonth(), behavior);
    },
    [resolveGestureTargetMonth, scrollToMonthIndex],
  );

  const goToday = useCallback(() => {
    const today = todayISO();
    onSelectDate(today);
    if (peekMode) {
      setPeekEngaged(false);
      requestAnimationFrame(() => scrollToMonth(today));
    } else {
      lastScrolledMonthRef.current = null;
      requestAnimationFrame(() => scrollToMonth(today));
    }
  }, [onSelectDate, peekMode, scrollToMonth]);

  useLayoutEffect(() => {
    if (isPeek) {
      lastScrolledMonthRef.current = null;
    }
    const monthKey = selectedDate.slice(0, 7);
    if (!isPeek && lastScrolledMonthRef.current === monthKey) return;
    scrollToMonth(selectedDate);
    if (!isPeek) {
      lastScrolledMonthRef.current = monthKey;
    }
  }, [isPeek, selectedDate, scrollToMonth]);

  useEffect(() => {
    if (peekMode) {
      setPeekEngaged(false);
    } else {
      setPeekEngaged(true);
    }
  }, [peekMode, selectedDate]);

  const handleDaySelect = (cellIso: string) => {
    if (peekSuppressClickRef.current) return;
    onSelectDate(cellIso);
  };

  const engagePeek = useCallback(() => {
    if (peekMode && !peekEngaged) {
      setPeekEngaged(true);
      requestAnimationFrame(() => scrollToMonth(selectedDate));
    }
  }, [peekMode, peekEngaged, scrollToMonth, selectedDate]);

  useEffect(() => {
    const strip = horizontalRef.current;
    if (!strip) return;

    let touchStartX = 0;
    let touchStartY = 0;
    let tracking = false;
    let didDrag = false;
    let suppressTimer: ReturnType<typeof setTimeout> | undefined;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0]?.clientX ?? 0;
      touchStartY = e.touches[0]?.clientY ?? 0;
      tracking = true;
      didDrag = false;
      peekSuppressClickRef.current = false;
      gestureDeltaXRef.current = 0;
      gestureStartMonthIdxRef.current = getMonthIndexFromScroll();
      gestureStartScrollLeftRef.current = strip.scrollLeft;
      engagePeek();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking) return;

      const x = e.touches[0]?.clientX ?? 0;
      const y = e.touches[0]?.clientY ?? 0;
      const dx = touchStartX - x;
      const dy = touchStartY - y;

      if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) return;

      if (Math.abs(dx) >= Math.abs(dy)) {
        didDrag = true;
        gestureDeltaXRef.current = dx;
        peekSuppressClickRef.current = true;
        engagePeek();
      }
    };

    const onTouchEnd = () => {
      if (!tracking) return;
      tracking = false;

      if (didDrag) {
        snapToGestureMonth("smooth");
        window.setTimeout(() => {
          peekSuppressClickRef.current = false;
        }, 350);
      }
    };

    const onScroll = () => {
      engagePeek();
      peekSuppressClickRef.current = true;
      if (suppressTimer) clearTimeout(suppressTimer);
      suppressTimer = setTimeout(() => {
        peekSuppressClickRef.current = false;
      }, 350);
    };

    let scrollSnapTimer: ReturnType<typeof setTimeout> | undefined;
    const onScrollSnap = () => {
      if (scrollSnapTimer) clearTimeout(scrollSnapTimer);
      scrollSnapTimer = setTimeout(() => {
        if (!tracking) snapToGestureMonth("smooth");
      }, 120);
    };

    const onPointerDown = () => {
      gestureStartMonthIdxRef.current = getMonthIndexFromScroll();
      gestureStartScrollLeftRef.current = strip.scrollLeft;
      gestureDeltaXRef.current = 0;
    };

    const onScrollEnd = () => {
      if (!tracking) snapToGestureMonth("smooth");
    };

    strip.addEventListener("pointerdown", onPointerDown, { passive: true });
    strip.addEventListener("touchstart", onTouchStart, { passive: true });
    strip.addEventListener("touchmove", onTouchMove, { passive: true });
    strip.addEventListener("touchend", onTouchEnd, { passive: true });
    strip.addEventListener("touchcancel", onTouchEnd, { passive: true });
    strip.addEventListener("scroll", onScroll, { passive: true });
    strip.addEventListener("scroll", onScrollSnap, { passive: true });
    strip.addEventListener("scrollend", onScrollEnd);

    return () => {
      strip.removeEventListener("pointerdown", onPointerDown);
      strip.removeEventListener("touchstart", onTouchStart);
      strip.removeEventListener("touchmove", onTouchMove);
      strip.removeEventListener("touchend", onTouchEnd);
      strip.removeEventListener("touchcancel", onTouchEnd);
      strip.removeEventListener("scroll", onScroll);
      strip.removeEventListener("scroll", onScrollSnap);
      strip.removeEventListener("scrollend", onScrollEnd);
      if (suppressTimer) clearTimeout(suppressTimer);
      if (scrollSnapTimer) clearTimeout(scrollSnapTimer);
    };
  }, [engagePeek, getMonthIndexFromScroll, snapToGestureMonth]);

  const renderDayButton = (
    cell: CalendarCell,
    cellIndex: number,
    year: number,
    month: number,
  ) => {
    const cellIso = getGridCellIso(year, month, cellIndex);
    const dayTasks = tasksByDate.get(cellIso) ?? [];

    return (
      <MobileCalendarDayCell
        key={`${year}-${month}-${cellIndex}-${cell.day}-${cell.inMonth}`}
        cell={cell}
        cellIndex={cellIndex}
        year={year}
        month={month}
        selectedDate={selectedDate}
        dayTasks={dayTasks}
        onSelect={handleDaySelect}
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

  const renderDayGrid = (year: number, month: number, grid: CalendarCell[]) => (
    <div className="grid grid-cols-7 border-l border-t border-black/[0.04]" style={{ touchAction: "pan-x" }}>
      {grid.map((cell, i) => renderDayButton(cell, i, year, month))}
    </div>
  );

  const visibleMonth = months[visibleMonthIdx] ?? months[selectedMonthIdx];
  const visibleWeekCount = visibleMonth
    ? getMonthWeekCount(visibleMonth.year, visibleMonth.month)
    : 5;
  const engagedWrapH =
    PEEK_HEADER_H + visibleWeekCount * CALENDAR_CELL_ROW_H + MONTH_PANEL_Y_PAD;
  const calendarShellH = isPeek ? PEEK_WRAP_H : engagedWrapH;

  return (
    <div
      data-mobile-calendar
      className="relative overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-black/[0.04] transition-[height,max-height] duration-300 ease-out"
      style={{
        height: `${calendarShellH}px`,
        maxHeight: `${calendarShellH}px`,
        touchAction: "pan-x pinch-zoom",
      }}
      onPointerDown={engagePeek}
    >
      <div
        ref={horizontalRef}
        className="flex h-full w-full overflow-x-auto overscroll-x-contain scrollbar-none"
        style={{
          WebkitOverflowScrolling: "touch",
          touchAction: "pan-x pinch-zoom",
        }}
      >
        {months.map(({ year, month }, monthIdx) => {
          const grid = getCalendarGrid(year, month);
          const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
          const isFocusMonth = monthKey === selectedMonthKey;
          const monthPanelBg = monthIdx % 2 === 0 ? "bg-white" : "bg-gray-50";
          const weekCount = getMonthWeekCount(year, month);
          const peekRowOffset =
            isPeek && isFocusMonth
              ? Math.floor(getPeekWeekStartIndex(selectedDate, year, month) / 7) *
                CALENDAR_CELL_ROW_H
              : 0;
          const fullGridH = weekCount * CALENDAR_CELL_ROW_H;
          const monthLabel = new Intl.DateTimeFormat("ja-JP", {
            year: "numeric",
            month: "long",
          }).format(new Date(year, month, 1));

          return (
            <div
              key={`${year}-${month}`}
              className={`box-border h-full min-w-full flex-[0_0_100%] shrink-0 overflow-hidden px-0.5 py-2 ${monthPanelBg}`}
            >
              {renderMonthHeader(year, month, monthLabel)}
              {weekdayHeader(year, month)}
              <div
                data-calendar-grid-clip
                className="overflow-hidden transition-[height] duration-300 ease-out"
                style={
                  isPeek && isFocusMonth
                    ? { height: `${PEEK_GRID_H}px` }
                    : { height: `${fullGridH}px` }
                }
              >
                <div
                  data-calendar-grid-inner
                  className="will-change-transform transition-transform duration-300 ease-out"
                  style={
                    isPeek && isFocusMonth && peekRowOffset > 0
                      ? { transform: `translateY(-${peekRowOffset}px)` }
                      : undefined
                  }
                >
                  {renderDayGrid(year, month, grid)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DailyMemoEditor({
  date,
  body: serverBody,
  onSave,
}: {
  date: string;
  body: string;
  onSave: (date: string, body: string) => Promise<boolean>;
}) {
  const [body, setBody] = useState(serverBody);
  const dateRef = useRef(date);
  const baselineRef = useRef(serverBody);
  const bodyRef = useRef(serverBody);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  bodyRef.current = body;

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => {
    if (date !== dateRef.current) {
      dateRef.current = date;
      setBody(serverBody);
      baselineRef.current = serverBody;
      return;
    }
    if (bodyRef.current === baselineRef.current && serverBody !== baselineRef.current) {
      setBody(serverBody);
      baselineRef.current = serverBody;
    }
  }, [date, serverBody]);

  useEffect(() => {
    resizeTextarea();
  }, [body, resizeTextarea]);

  const flush = useCallback(async () => {
    if (bodyRef.current === baselineRef.current) return;
    const ok = await onSave(date, bodyRef.current);
    if (ok) {
      baselineRef.current = bodyRef.current;
    }
  }, [date, onSave]);

  useEffect(() => {
    if (body === baselineRef.current) return;
    const timer = setTimeout(() => {
      void flush();
    }, 400);
    return () => clearTimeout(timer);
  }, [body, flush]);

  useEffect(() => {
    return () => {
      void flush();
    };
  }, [date, flush]);

  useEffect(() => {
    const onPageHide = () => {
      void flush();
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [flush]);

  return (
    <article className="rounded-md border border-black/[0.06] bg-[#fafafa]/80 px-3 py-2.5">
      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={1}
        className="w-full resize-none overflow-hidden bg-transparent text-[12px] leading-relaxed text-gray-800 outline-none placeholder:text-gray-300"
        placeholder="メモを書き込む…"
      />
    </article>
  );
}

function DailyMemoBoard({
  memos,
  viewDateISO,
  onSave,
}: {
  memos: DailyMemo[];
  viewDateISO: string;
  onSave: (date: string, body: string) => Promise<boolean>;
}) {
  const [writeDate, setWriteDate] = useState(viewDateISO);

  useEffect(() => {
    setWriteDate(viewDateISO);
  }, [viewDateISO]);

  const dayMemo = useMemo(() => {
    const sameDay = memos
      .filter((m) => m.date === writeDate)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (sameDay.length === 0) return null;
    return {
      id: sameDay[0].id,
      date: writeDate,
      body: sameDay
        .map((m) => m.body.trim())
        .filter(Boolean)
        .join("\n"),
      createdAt: sameDay[0].createdAt,
    };
  }, [memos, writeDate]);

  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold text-gray-900">メモ</h3>
      <label className="mb-3 block">
        <input
          type="date"
          value={writeDate}
          onChange={(e) => setWriteDate(e.target.value)}
          className="w-full rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2 text-[13px] outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
        />
      </label>
      <DailyMemoEditor
        key={writeDate}
        date={writeDate}
        body={dayMemo?.body ?? ""}
        onSave={onSave}
      />
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

/* ─── Add Project Modal ─── */

function AddProjectModalForm({
  onClose,
  onSubmit,
  existingNames,
}: {
  onClose: () => void;
  onSubmit: (name: string) => boolean;
  existingNames: readonly string[];
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("プロジェクト名を入力してください");
      return;
    }
    if (existingNames.includes(trimmed)) {
      setError("同じ名前のプロジェクトが既にあります");
      return;
    }
    const ok = onSubmit(trimmed);
    if (!ok) {
      setError("プロジェクトを追加できませんでした");
      return;
    }
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
          <h3 className="text-lg font-semibold text-gray-900">プロジェクトを追加</h3>
          <button type="button" onClick={onClose} className="rounded-xl p-2 text-gray-400 hover:bg-gray-50">
            <Icon name="x" className="h-5 w-5" />
          </button>
        </div>
        <label className="mb-4 block">
          <span className="mb-2 block text-[12px] font-medium text-gray-400">プロジェクト名</span>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="例：DP新宿"
            className="w-full rounded-lg border border-gray-100 bg-gray-50/60 px-4 py-3 text-[15px] outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
            autoFocus
          />
        </label>
        {error && <p className="mb-4 text-[13px] text-red-500">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-2xl px-5 py-2.5 text-sm font-medium text-gray-500 hover:bg-gray-50">
            キャンセル
          </button>
          <button type="button" onClick={submit} className="rounded-2xl bg-blue-500 px-5 py-2.5 text-sm font-medium text-white shadow-sm shadow-blue-500/25 hover:bg-blue-600">
            追加する
          </button>
        </div>
      </div>
    </div>
  );
}

function AddProjectModal({
  open,
  onClose,
  onSubmit,
  existingNames,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (name: string) => boolean;
  existingNames: readonly string[];
}) {
  if (!open) return null;
  return (
    <AddProjectModalForm onClose={onClose} onSubmit={onSubmit} existingNames={existingNames} />
  );
}

function SortableSidebarProjectItem({
  project,
  active,
  accent,
  onSelect,
}: {
  project: SidebarProject;
  active: boolean;
  accent: string;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: project.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className="flex items-center gap-0.5"
    >
      <button
        type="button"
        aria-label={`${project.name}の順番を変更`}
        className="flex h-7 w-5 shrink-0 cursor-grab items-center justify-center rounded text-gray-300 hover:text-gray-500 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <Icon name="grip" className="h-3 w-3" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-all duration-200 ${
          active
            ? "bg-[#007AFF]/10 font-medium text-[#007AFF]"
            : "text-gray-600 hover:bg-black/[0.03]"
        }`}
      >
        <ProjectColorSwatch accent={accent} size="sm" />
        <span className="truncate">{project.name}</span>
      </button>
    </div>
  );
}

function DesktopProjectSidebar({
  projects,
  activeProject,
  projectColors,
  sensors,
  onSelect,
  onAdd,
  onDragEnd,
}: {
  projects: SidebarProject[];
  activeProject: string;
  projectColors: Record<string, string>;
  sensors: ReturnType<typeof useSensors>;
  onSelect: (name: string) => void;
  onAdd: () => void;
  onDragEnd: (event: DragEndEvent) => void;
}) {
  return (
    <>
      <div className="mb-1.5 flex items-center justify-between px-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Projects</span>
        <button
          type="button"
          onClick={onAdd}
          className="flex h-5 w-5 items-center justify-center rounded-md text-gray-400 hover:bg-black/[0.04]"
          aria-label="プロジェクトを追加"
        >
          <Icon name="plus" className="h-3 w-3" />
        </button>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <nav className="flex-1 space-y-0.5 overflow-y-auto">
          <button
            type="button"
            onClick={() => onSelect(ALL_PROJECTS_LABEL)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-all duration-200 ${
              activeProject === ALL_PROJECTS_LABEL
                ? "bg-[#007AFF]/10 font-medium text-[#007AFF]"
                : "text-gray-600 hover:bg-black/[0.03]"
            }`}
          >
            <Icon
              name={activeProject === ALL_PROJECTS_LABEL ? "folderOpen" : "folder"}
              className={`h-3.5 w-3.5 shrink-0 ${activeProject === ALL_PROJECTS_LABEL ? "text-[#007AFF]" : "text-gray-400"}`}
            />
            <span className="truncate">すべて</span>
          </button>

          <SortableContext items={projects.map((p) => p.id)} strategy={verticalListSortingStrategy}>
            {projects.map((project) => (
              <SortableSidebarProjectItem
                key={project.id}
                project={project}
                active={activeProject === project.name}
                accent={projectColors[project.name] ?? DEFAULT_PROJECT_ACCENT}
                onSelect={() => onSelect(project.name)}
              />
            ))}
          </SortableContext>
        </nav>
      </DndContext>
    </>
  );
}

/* ─── Add Case Modal ─── */

function AddCaseModalForm({
  onClose,
  onSubmit,
  defaultProject,
}: {
  onClose: () => void;
  onSubmit: (data: { title: string; project: string }) => void;
  defaultProject?: string;
}) {
  const { projectOptions } = useProjectColors();
  const [title, setTitle] = useState("");
  const [project, setProject] = useState<string>(defaultProject ?? projectOptions[0] ?? "");

  useEffect(() => {
    if (defaultProject) {
      setProject(defaultProject);
    }
  }, [defaultProject]);

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
            {projectOptions.map((p) => (
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
  defaultProject,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { title: string; project: string }) => void;
  defaultProject?: string;
}) {
  if (!open) return null;
  return (
    <AddCaseModalForm
      key={defaultProject ?? "default"}
      onClose={onClose}
      onSubmit={onSubmit}
      defaultProject={defaultProject}
    />
  );
}

/* ─── Add Task Modal ─── */

function AddTaskModalForm({
  onClose,
  onSubmit,
  ongoingCases,
  projectOptions,
  defaultProject,
  defaultDate,
  defaultCaseId,
}: {
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    date: string;
    project: string;
    caseId?: string;
  }) => void;
  ongoingCases: CaseItem[];
  projectOptions: readonly string[];
  defaultProject?: string;
  defaultDate?: string;
  defaultCaseId?: string;
}) {
  const [title, setTitle] = useState("");
  const [underProjectDirect, setUnderProjectDirect] = useState(false);
  const [project, setProject] = useState(
    defaultProject ?? projectOptions[0] ?? "",
  );
  const casePool = useMemo(() => {
    if (defaultProject) {
      return ongoingCases.filter((c) => c.project === defaultProject);
    }
    return ongoingCases;
  }, [ongoingCases, defaultProject]);
  const [caseId, setCaseId] = useState(defaultCaseId ?? "");
  const [date, setDate] = useState(defaultDate ?? todayISO());

  useEffect(() => {
    if (defaultProject) {
      setProject(defaultProject);
    }
  }, [defaultProject]);

  useEffect(() => {
    if (defaultCaseId) {
      setUnderProjectDirect(false);
      setCaseId(defaultCaseId);
      return;
    }
    setCaseId("");
  }, [defaultCaseId]);

  useEffect(() => {
    if (defaultDate) {
      setDate(defaultDate);
    }
  }, [defaultDate]);

  const submit = () => {
    if (!title.trim()) return;
    if (underProjectDirect) {
      if (!project) return;
      onSubmit({
        title: title.trim(),
        date,
        project,
        caseId: undefined,
      });
    } else {
      const linked = ongoingCases.find((c) => c.id === caseId);
      const resolvedProject =
        linked?.project ?? defaultProject ?? projectOptions[0] ?? "";
      if (!resolvedProject) return;
      onSubmit({
        title: title.trim(),
        date,
        project: resolvedProject,
        caseId: caseId || undefined,
      });
    }
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
        <label className="mb-4 block">
          <span className="mb-2 block text-[12px] font-medium text-gray-400">案件（任意）</span>
          <select
            value={caseId}
            onChange={(e) => setCaseId(e.target.value)}
            disabled={underProjectDirect}
            className={`mb-2 w-full rounded-2xl border border-gray-100 px-3 py-2.5 text-sm outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50 ${
              underProjectDirect
                ? "cursor-not-allowed bg-gray-100 text-gray-400 opacity-60"
                : "bg-gray-50/60"
            }`}
          >
            <option value="">案件を選択</option>
            {casePool.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-[13px] text-gray-700">
            <input
              type="checkbox"
              checked={underProjectDirect}
              onChange={(e) => {
                const checked = e.target.checked;
                setUnderProjectDirect(checked);
                if (checked) setCaseId("");
              }}
              className="h-4 w-4 rounded border-gray-300 text-blue-500 focus:ring-blue-200"
            />
            プロジェクト直下
          </label>
          {underProjectDirect && (
            <select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full rounded-2xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-sm outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
            >
              {projectOptions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="mb-6 block">
          <span className="mb-2 block text-[12px] font-medium text-gray-400">期限</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-2xl border border-gray-100 bg-gray-50/60 px-3 py-2.5 text-sm outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
          />
        </label>
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
  ongoingCases,
  projectOptions,
  defaultProject,
  defaultDate,
  defaultCaseId,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: {
    title: string;
    date: string;
    project: string;
    caseId?: string;
  }) => void;
  ongoingCases: CaseItem[];
  projectOptions: readonly string[];
  defaultProject?: string;
  defaultDate?: string;
  defaultCaseId?: string;
}) {
  if (!open) return null;
  return (
    <AddTaskModalForm
      key={`${defaultProject ?? "default"}-${defaultDate ?? "default"}-${defaultCaseId ?? "default"}`}
      onClose={onClose}
      onSubmit={onSubmit}
      ongoingCases={ongoingCases}
      projectOptions={projectOptions}
      defaultProject={defaultProject}
      defaultDate={defaultDate}
      defaultCaseId={defaultCaseId}
    />
  );
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
  const router = useRouter();
  const {
    user,
    authReady,
    authChecked,
    dataReady,
    loadError,
    caseSaveError,
    projectNames,
    projects,
    projectColors,
    lastViewDate,
    tasks,
    cases,
    memos,
    dailyMemos,
    setProjectColor,
    addProject,
    replaceProjects,
    saveViewDate,
    signOut,
    reload,
    addTask: persistAddTask,
    replaceTasks,
    replaceCases,
    updateCase,
    toggleCase,
    deleteTask,
    addCase,
    saveProjectMemo,
    deleteProjectMemo,
    saveDailyMemo,
  } = useGyokanData();

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskModalDefaultProject, setTaskModalDefaultProject] = useState<string | undefined>();
  const [taskModalDefaultDate, setTaskModalDefaultDate] = useState<string | undefined>();
  const [taskModalDefaultCaseId, setTaskModalDefaultCaseId] = useState<string | undefined>();
  const [caseModalOpen, setCaseModalOpen] = useState(false);
  const [caseModalDefaultProject, setCaseModalDefaultProject] = useState<string | undefined>();
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [selectedCase, setSelectedCase] = useState<CaseItem | null>(null);
  const [viewingCaseId, setViewingCaseId] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [mobileTab, setMobileTab] = useState<MobileTab>("home");
  const [activeProject, setActiveProject] = useState<string>(ALL_PROJECTS_LABEL);
  const [viewDateISO, setViewDateISO] = useState(() => todayISO());
  const [casesListOpen, setCasesListOpen] = useState(false);
  const viewDateInitialized = useRef(false);

  const viewDateLabel = formatDateJa(viewDateISO);
  const isAllProjects = activeProject === ALL_PROJECTS_LABEL;
  const viewingCase = viewingCaseId
    ? cases.find((c) => c.id === viewingCaseId) ?? null
    : null;

  const viewingCaseTasks = useMemo(() => {
    if (!viewingCaseId) return [];
    return sortTasksInCase(tasks.filter((t) => t.caseId === viewingCaseId));
  }, [tasks, viewingCaseId]);

  useEffect(() => {
    if (!authReady || !authChecked) return;
    if (!user) {
      router.replace("/login");
    }
  }, [authReady, authChecked, user, router]);

  useEffect(() => {
    setViewingCaseId(null);
  }, [activeProject, mobileTab]);

  useEffect(() => {
    if (!dataReady || viewDateInitialized.current) return;
    if (lastViewDate) {
      setViewDateISO(lastViewDate);
    }
    viewDateInitialized.current = true;
  }, [dataReady, lastViewDate]);

  useEffect(() => {
    if (!user || !dataReady) return;
    saveViewDate(viewDateISO);
  }, [viewDateISO, user, dataReady, saveViewDate]);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleRefresh = useCallback(async () => {
    const lastView = await reload();
    if (lastView) setViewDateISO(lastView);
  }, [reload]);

  const viewDateTasks = useMemo(
    () => tasks.filter((t) => !isRangeTask(t) && t.date === viewDateISO),
    [tasks, viewDateISO],
  );
  const activeTasks = useMemo(() => viewDateTasks.filter((t) => !t.done), [viewDateTasks]);
  const completedTasks = useMemo(() => viewDateTasks.filter((t) => t.done), [viewDateTasks]);

  const ongoingCases = useMemo(
    () => cases.filter((c) => !c.done),
    [cases],
  );

  const orderedOngoingCases = useMemo(
    () => sortCasesByProjectOrder(ongoingCases, projects),
    [ongoingCases, projects],
  );

  const caseById = useMemo(() => {
    const map: Record<string, CaseItem> = {};
    for (const item of cases) {
      map[item.id] = item;
    }
    return map;
  }, [cases]);

  const caseTitleById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const item of cases) {
      map[item.id] = item.title;
    }
    return map;
  }, [cases]);

  const projectColorsValue = useMemo(
    () => ({
      colors: projectColors,
      setProjectColor,
      projectOptions: projectNames,
      cases,
      ongoingCases,
      caseTitleById,
    }),
    [projectColors, setProjectColor, projectNames, cases, ongoingCases, caseTitleById],
  );

  const incompleteOtherTasks = useMemo(() => {
    if (viewDateISO > todayISO()) {
      return [];
    }
    let list = tasks.filter(
      (t) => !t.done && !isRangeTask(t) && t.date < viewDateISO,
    );
    if (!isAllProjects) {
      list = list.filter((t) => taskBelongsToProject(t, activeProject, caseById));
    }
    return sortTasksActiveFirst(list);
  }, [tasks, viewDateISO, activeProject, isAllProjects, caseById]);

  const upcomingRangeTasks = useMemo(() => {
    let list = tasks.filter((t) => isActiveRangeTask(t, viewDateISO));
    if (!isAllProjects) {
      list = list.filter((t) => taskBelongsToProject(t, activeProject, caseById));
    }
    return list;
  }, [tasks, viewDateISO, activeProject, isAllProjects, caseById]);

  const completedCasesCount = useMemo(
    () => cases.filter((c) => c.done).length,
    [cases],
  );
  const caseGridDisplay = useMemo(
    () => getCaseGridDisplay(orderedOngoingCases),
    [orderedOngoingCases],
  );
  const openCasesList = useCallback(() => {
    setCasesListOpen(true);
    setMobileTab("home");
  }, []);

  const displayedTasks = useMemo(() => {
    let list = viewDateTasks;
    if (!isAllProjects) {
      list = list.filter((t) => taskBelongsToProject(t, activeProject, caseById));
    }
    const active = list.filter((t) => !t.done);
    const done = list.filter((t) => t.done);
    return [...active, ...done];
  }, [viewDateTasks, activeProject, isAllProjects, caseById]);

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

      replaceTasks((prev) => {
        let visible = prev.filter((t) => !isRangeTask(t) && t.date === viewDateISO);
        if (!isAllProjects) {
          visible = visible.filter((t) => taskBelongsToProject(t, activeProject, caseById));
        }
        return reorderTasksInList(prev, visible, active.id, over.id);
      });
    },
    [activeProject, isAllProjects, viewDateISO, reorderTasksInList, replaceTasks],
  );

  const handleUpcomingTaskDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      replaceTasks((prev) => {
        let visible = prev.filter((t) => isActiveRangeTask(t, viewDateISO));
        if (!isAllProjects) {
          visible = visible.filter((t) => taskBelongsToProject(t, activeProject, caseById));
        }
        return reorderTasksInList(prev, visible, active.id, over.id);
      });
    },
    [activeProject, isAllProjects, viewDateISO, reorderTasksInList, replaceTasks],
  );

  const handleCaseDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    replaceCases((prev) => {
      const ongoing = prev.filter((c) => !c.done);
      const completed = prev.filter((c) => c.done);
      const oldIndex = ongoing.findIndex((c) => c.id === active.id);
      const newIndex = ongoing.findIndex((c) => c.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return [...arrayMove(ongoing, oldIndex, newIndex), ...completed];
    });
  }, [replaceCases]);

  const handleProjectDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    replaceProjects((prev) => {
      const oldIndex = prev.findIndex((p) => p.id === active.id);
      const newIndex = prev.findIndex((p) => p.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, [replaceProjects]);

  const handleAddProject = useCallback((name: string) => {
    const ok = addProject(name);
    if (ok) setActiveProject(name);
    return ok;
  }, [addProject]);

  const addTask = useCallback(
    (data: { title: string; date: string; project: string; caseId?: string }) => {
      persistAddTask({
        title: data.title,
        time: formatTaskTimeLabel(data.date),
        date: data.date,
        project: data.project,
        caseId: data.caseId,
      });
    },
    [persistAddTask],
  );

  const updateTask = useCallback(
    (
      id: string,
      data: {
        title: string;
        caseId: string;
        date: string;
        dateEnd?: string;
        project?: string;
      },
    ) => {
      const linked = data.caseId ? caseById[data.caseId] : undefined;
      replaceTasks((prev) =>
        prev.map((t) => {
          if (t.id !== id) return t;
          const next: Task = {
            ...t,
            title: data.title,
            caseId: data.caseId || undefined,
            project: linked?.project ?? data.project ?? t.project,
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
    [replaceTasks, caseById],
  );

  const toggleTask = useCallback((id: string) => {
    replaceTasks((prev) => {
      const updated = prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
      const task = updated.find((t) => t.id === id);
      if (!task || isRangeTask(task)) return updated;
      return sortTasksByDateWithDoneLast(updated, task.date);
    });
  }, [replaceTasks]);

  const openAddCaseModal = useCallback((project?: string) => {
    setCaseModalDefaultProject(project);
    setCaseModalOpen(true);
  }, []);

  const closeAddCaseModal = useCallback(() => {
    setCaseModalOpen(false);
    setCaseModalDefaultProject(undefined);
  }, []);

  const openAddTaskModal = useCallback((project?: string, date?: string, caseId?: string) => {
    setTaskModalDefaultProject(project);
    setTaskModalDefaultDate(date);
    setTaskModalDefaultCaseId(caseId);
    setTaskModalOpen(true);
  }, []);

  const closeAddTaskModal = useCallback(() => {
    setTaskModalOpen(false);
    setTaskModalDefaultProject(undefined);
    setTaskModalDefaultDate(undefined);
    setTaskModalDefaultCaseId(undefined);
  }, []);

  const openTaskModalForView = useCallback(() => {
    openAddTaskModal(isAllProjects ? undefined : activeProject, viewDateISO);
  }, [openAddTaskModal, isAllProjects, activeProject, viewDateISO]);

  const openTaskModalForCase = useCallback(
    (caseItem: CaseItem) => {
      openAddTaskModal(caseItem.project, viewDateISO, caseItem.id);
    },
    [openAddTaskModal, viewDateISO],
  );

  const openProjectCase = useCallback((item: CaseItem) => {
    setViewingCaseId(item.id);
  }, []);

  if (!isClient || !authReady || (user && !dataReady)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#fafafa] px-6">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
        {loadError && (
          <p className="max-w-sm text-center text-[13px] text-red-600">
            データの読み込みに問題があります: {loadError}
          </p>
        )}
      </div>
    );
  }

  if (!user) {
    return null;
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

  const showHomeCaseGrid = mobileTab === "home";
  const showTasks = mobileTab === "home";

  return (
    <ProjectColorsContext.Provider value={projectColorsValue}>
    <div className="min-h-screen bg-[#fafafa] font-[family-name:var(--font-geist-sans)] text-gray-900 antialiased">
      <PullToRefresh enabled={isClient} onRefresh={handleRefresh} />
      <div className="mx-auto flex min-h-screen max-w-[1480px]">
        {/* Left Sidebar */}
        <aside className="sticky top-0 hidden h-screen w-[168px] shrink-0 flex-col border-r border-black/[0.06] bg-white/70 px-3 py-5 backdrop-blur-xl lg:flex">
          <div className="mb-6 flex items-center justify-between gap-2 px-1">
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#007AFF] text-[11px] font-bold text-white shadow-sm">行</div>
              <span className="truncate text-[13px] font-semibold tracking-tight text-gray-900">行間</span>
            </div>
            <RefreshButton iconClassName="h-4 w-4" className="shrink-0 p-1.5 hover:bg-black/[0.04]" onRefresh={handleRefresh} />
          </div>

          <DesktopProjectSidebar
            projects={projects}
            activeProject={activeProject}
            projectColors={projectColors}
            sensors={sensors}
            onSelect={setActiveProject}
            onAdd={() => setProjectModalOpen(true)}
            onDragEnd={handleProjectDragEnd}
          />

          <button type="button" className="mt-3 flex w-full items-center gap-2 rounded-lg border border-black/[0.05] px-2 py-2 text-[11px] text-gray-500 transition-all duration-200 hover:bg-black/[0.02]">
            <Icon name="folder" className="h-3.5 w-3.5 text-gray-400" />
            完了済み
          </button>
        </aside>

        {/* Main + Right Panel */}
        <div className="flex min-w-0 flex-1">
        <main className="min-w-0 flex-1 pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="mx-auto max-w-3xl px-2.5 py-2 sm:px-4 lg:max-w-none lg:px-5 lg:pb-2 lg:pt-2">
            {loadError && (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
                データの読み込みに問題があります: {loadError}
                <span className="mt-1 block text-[12px] text-red-500/80">
                  表示中のデータは保持されています。更新ボタンで再読み込みしてください。
                </span>
              </p>
            )}
            {caseSaveError && (
              <p className="mb-3 rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
                案件の保存に失敗しました: {caseSaveError}
              </p>
            )}
            {!casesListOpen && (
            <header className="mb-2 lg:mb-3">
              <div className="mb-2 flex items-center justify-between gap-2 lg:hidden">
                <button type="button" className="shrink-0 rounded-xl p-2 text-gray-500 hover:bg-white"><Icon name="menu" className="h-5 w-5" /></button>
                <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
                  <span className="shrink-0 text-[14px] font-medium text-gray-900">{viewDateLabel}</span>
                  {!isAllProjects && <ProjectColorHeaderLink project={activeProject} />}
                </div>
                <RefreshButton className="shrink-0" onRefresh={handleRefresh} />
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
                {!isAllProjects && <ProjectColorHeaderLink project={activeProject} />}
                <RefreshButton iconClassName="h-4 w-4" className="ml-auto rounded-lg p-1.5" onRefresh={handleRefresh} />
              </div>
            </header>
            )}

            {casesListOpen ? (
              <CasesListSection
                cases={orderedOngoingCases}
                onToggle={toggleCase}
                onOpen={setSelectedCase}
                onBack={() => setCasesListOpen(false)}
                sensors={sensors}
                onDragEnd={handleCaseDragEnd}
              />
            ) : mobileTab === "memo" ? (
              <section className="space-y-3 lg:hidden">
                <Card className="overflow-hidden p-1.5">
                  <MobileCalendarWidget
                    tasks={tasks}
                    selectedDate={viewDateISO}
                    onSelectDate={goToDate}
                    peekMode
                  />
                </Card>
                <Card className="p-4">
                  <DailyMemoBoard
                    memos={dailyMemos}
                    viewDateISO={viewDateISO}
                    onSave={saveDailyMemo}
                  />
                </Card>
              </section>
            ) : mobileTab === "projects" ? (
              isAllProjects ? (
                <MobileProjectList
                  projects={projectNames}
                  cases={cases}
                  onSelect={setActiveProject}
                />
              ) : (
                <>
                  {viewingCase ? (
                    <CaseDetailSection
                      item={viewingCase}
                      onSave={updateCase}
                      onBack={() => setViewingCaseId(null)}
                      onToggle={toggleCase}
                      caseTasks={viewingCaseTasks}
                      onAddTask={() => openTaskModalForCase(viewingCase)}
                      onToggleTask={toggleTask}
                      onOpenTask={setSelectedTask}
                    />
                  ) : (
                    <>
                      <ProjectDetailSection
                        project={activeProject}
                        cases={cases}
                        memos={memos}
                        onToggleCase={toggleCase}
                        onOpenCase={openProjectCase}
                        onSaveMemo={saveProjectMemo}
                        onDeleteMemo={deleteProjectMemo}
                        onAddCase={() => openAddCaseModal(activeProject)}
                        onBack={() => setActiveProject(ALL_PROJECTS_LABEL)}
                      />
                      <TodayTasksSection
                        viewDateISO={viewDateISO}
                        activeTaskCount={activeTasks.length}
                        completedTaskCount={completedTasks.length}
                        displayedTasks={displayedTasks}
                        incompleteOtherTasks={incompleteOtherTasks}
                        renderTaskList={renderTaskList}
                        onAddTask={openTaskModalForView}
                      />
                    </>
                  )}
                </>
              )
            ) : (
              <>
            <div className="flex flex-col">
            {showTasks && (
              <section className="order-1 mb-3 lg:hidden">
                <MobileCalendarWidget
                  tasks={tasks}
                  selectedDate={viewDateISO}
                  onSelectDate={goToDate}
                  peekMode
                />
              </section>
            )}

            {!isAllProjects && (
              viewingCase ? (
                <CaseDetailSection
                  item={viewingCase}
                  onSave={updateCase}
                  onBack={() => setViewingCaseId(null)}
                  onToggle={toggleCase}
                  caseTasks={viewingCaseTasks}
                  onAddTask={() => openTaskModalForCase(viewingCase)}
                  onToggleTask={toggleTask}
                  onOpenTask={setSelectedTask}
                  className="order-2 mb-4 lg:order-2 lg:mb-4"
                />
              ) : (
                <ProjectDetailSection
                  project={activeProject}
                  cases={cases}
                  memos={memos}
                  onToggleCase={toggleCase}
                  onOpenCase={openProjectCase}
                  onSaveMemo={saveProjectMemo}
                  onDeleteMemo={deleteProjectMemo}
                  onAddCase={() => openAddCaseModal(activeProject)}
                  className="order-2 mb-4 lg:order-2 lg:mb-4"
                />
              )
            )}

            {showTasks && (
              <TodayTasksSection
                viewDateISO={viewDateISO}
                activeTaskCount={activeTasks.length}
                completedTaskCount={completedTasks.length}
                displayedTasks={displayedTasks}
                incompleteOtherTasks={incompleteOtherTasks}
                renderTaskList={renderTaskList}
                onAddTask={openTaskModalForView}
                className={!isAllProjects ? "order-3 lg:order-3" : "order-2 lg:order-3"}
              />
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
                    onClick={openTaskModalForView}
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

            {isAllProjects && (
              <section
                className={`order-3 mb-3 lg:order-1 lg:mb-4 ${showHomeCaseGrid ? "" : "hidden lg:block"}`}
              >
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
                      onClick={() => openAddCaseModal()}
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

              </>
            )}

            {!casesListOpen && mobileTab === "more" && (
              <section className="space-y-4">
                {loadError && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
                    {loadError}
                  </p>
                )}
                {caseSaveError && (
                  <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] text-red-600">
                    案件の保存に失敗しました: {caseSaveError}
                  </p>
                )}
                <Card className="p-6">
                  <h3 className="mb-4 text-[15px] font-semibold">設定</h3>
                  <ul className="space-y-2">
                    {[
                      ["通知", "オン"],
                      ["データ保存", "Supabase"],
                      ["テーマ", "ライト"],
                      ["アカウント", user.email ?? "ログイン中"],
                    ].map(([k, v]) => (
                      <li key={k} className="flex justify-between rounded-2xl bg-gray-50/80 px-4 py-3 text-[13px]">
                        <span className="text-gray-600">{k}</span>
                        <span className="max-w-[55%] truncate font-medium text-gray-400">{v}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="mt-4 w-full rounded-xl border border-black/[0.08] px-4 py-2.5 text-[13px] font-medium text-gray-600 transition-colors hover:bg-gray-50"
                  >
                    ログアウト
                  </button>
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
          <Card className="mb-4 p-4">
            <DailyMemoBoard
              memos={dailyMemos}
              viewDateISO={viewDateISO}
              onSave={saveDailyMemo}
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
            { id: "projects" as const, label: "プロジェクト", icon: "folder" },
            { id: "cases" as const, label: "案件", icon: "cases" },
            { id: "memo" as const, label: "メモ", icon: "memo" },
            { id: "more" as const, label: "その他", icon: "more" },
          ]).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                if (tab.id === "cases") {
                  openCasesList();
                } else if (tab.id === "projects") {
                  setCasesListOpen(false);
                  setActiveProject(ALL_PROJECTS_LABEL);
                  setMobileTab("projects");
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
        onClick={openTaskModalForView}
        className={`fixed z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-lg shadow-blue-500/35 transition-all duration-200 hover:scale-105 hover:bg-blue-600 active:scale-95 lg:hidden ${
          mobileTab === "memo" || mobileTab === "more" || casesListOpen ? "hidden" : ""
        }`}
        style={{ right: "1.25rem", bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
        aria-label="タスクを追加"
      >
        <Icon name="plus" className="h-6 w-6" />
      </button>

      <AddTaskModal
        open={taskModalOpen}
        onClose={closeAddTaskModal}
        onSubmit={addTask}
        ongoingCases={ongoingCases}
        projectOptions={projectNames}
        defaultProject={
          taskModalDefaultProject ??
          (isAllProjects ? undefined : activeProject)
        }
        defaultDate={taskModalDefaultDate}
        defaultCaseId={taskModalDefaultCaseId}
      />
      <AddProjectModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onSubmit={handleAddProject}
        existingNames={projectNames}
      />
      <AddCaseModal
        open={caseModalOpen}
        onClose={closeAddCaseModal}
        onSubmit={addCase}
        defaultProject={caseModalDefaultProject}
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
          layout="modal"
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
    </ProjectColorsContext.Provider>
  );
}
