import { DEFAULT_EVENT_COLOR, EVENT_COLOR_PALETTE } from "./event-colors";

export const DEFAULT_PROJECT_LABEL = "プロジェクト";
export const DEFAULT_CASE_LABEL = "案件";
export const DEFAULT_HOME_CASE_COLUMNS = 4;
export const MIN_HOME_CASE_COLUMNS = 1;
export const MAX_HOME_CASE_COLUMNS = 4;

export type DisplaySettings = {
  showProjects: boolean;
  showCases: boolean;
  projectLabel: string;
  caseLabel: string;
  homeCaseColumns: number;
  defaultEventColor: string;
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  showProjects: true,
  showCases: true,
  projectLabel: DEFAULT_PROJECT_LABEL,
  caseLabel: DEFAULT_CASE_LABEL,
  homeCaseColumns: DEFAULT_HOME_CASE_COLUMNS,
  defaultEventColor: DEFAULT_EVENT_COLOR,
};

const STORAGE_PREFIX = "gyokan-display-settings";

function storageKey(userId?: string | null) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

function normalizeLabel(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 16) : fallback;
}

function normalizeHomeCaseColumns(value: unknown): number {
  const n = typeof value === "number" ? Math.round(value) : DEFAULT_HOME_CASE_COLUMNS;
  if (Number.isNaN(n)) return DEFAULT_HOME_CASE_COLUMNS;
  return Math.min(MAX_HOME_CASE_COLUMNS, Math.max(MIN_HOME_CASE_COLUMNS, n));
}

function normalizeDefaultEventColor(value: unknown): string {
  return typeof value === "string" && EVENT_COLOR_PALETTE.includes(value.toUpperCase())
    ? value.toUpperCase()
    : DEFAULT_EVENT_COLOR;
}

export function readDisplaySettings(userId?: string | null): DisplaySettings {
  if (typeof window === "undefined") return DEFAULT_DISPLAY_SETTINGS;
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_DISPLAY_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<DisplaySettings>;
    return {
      showProjects: parsed.showProjects !== false,
      showCases: parsed.showCases !== false,
      projectLabel: normalizeLabel(parsed.projectLabel, DEFAULT_PROJECT_LABEL),
      caseLabel: normalizeLabel(parsed.caseLabel, DEFAULT_CASE_LABEL),
      homeCaseColumns: normalizeHomeCaseColumns(parsed.homeCaseColumns),
      defaultEventColor: normalizeDefaultEventColor(parsed.defaultEventColor),
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export function writeDisplaySettings(settings: DisplaySettings, userId?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const next: DisplaySettings = {
      showProjects: settings.showProjects,
      showCases: settings.showCases,
      projectLabel: normalizeLabel(settings.projectLabel, DEFAULT_PROJECT_LABEL),
      caseLabel: normalizeLabel(settings.caseLabel, DEFAULT_CASE_LABEL),
      homeCaseColumns: normalizeHomeCaseColumns(settings.homeCaseColumns),
      defaultEventColor: normalizeDefaultEventColor(settings.defaultEventColor),
    };
    const isDefault =
      next.showProjects === DEFAULT_DISPLAY_SETTINGS.showProjects &&
      next.showCases === DEFAULT_DISPLAY_SETTINGS.showCases &&
      next.projectLabel === DEFAULT_PROJECT_LABEL &&
      next.caseLabel === DEFAULT_CASE_LABEL &&
      next.homeCaseColumns === DEFAULT_HOME_CASE_COLUMNS &&
      next.defaultEventColor === DEFAULT_EVENT_COLOR;
    if (isDefault) {
      localStorage.removeItem(storageKey(userId));
      return;
    }
    localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    /* ignore quota errors */
  }
}
