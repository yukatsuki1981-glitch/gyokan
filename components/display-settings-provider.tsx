"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_DISPLAY_SETTINGS,
  readDisplaySettings,
  writeDisplaySettings,
  type DisplaySettings,
} from "@/lib/gyokan/display-settings";

type DisplaySettingsContextValue = DisplaySettings & {
  updateSettings: (patch: Partial<DisplaySettings>) => void;
  setShowProjects: (value: boolean) => void;
  setShowCases: (value: boolean) => void;
  setProjectLabel: (value: string) => void;
  setCaseLabel: (value: string) => void;
};

const DisplaySettingsContext = createContext<DisplaySettingsContextValue | null>(null);

export function DisplaySettingsProvider({
  userId,
  settings: controlledSettings,
  onSettingsChange,
  children,
}: {
  userId?: string | null;
  children: ReactNode;
  settings?: DisplaySettings;
  onSettingsChange?: (next: DisplaySettings) => void;
}) {
  const [internalSettings, setInternalSettings] = useState(DEFAULT_DISPLAY_SETTINGS);
  const settings = controlledSettings ?? internalSettings;

  useEffect(() => {
    if (controlledSettings) return;
    setInternalSettings(readDisplaySettings(userId));
  }, [userId, controlledSettings]);

  const persist = useCallback(
    (next: DisplaySettings) => {
      if (onSettingsChange) {
        onSettingsChange(next);
      } else {
        setInternalSettings(next);
        writeDisplaySettings(next, userId);
      }
    },
    [onSettingsChange, userId],
  );

  const updateSettings = useCallback(
    (patch: Partial<DisplaySettings>) => {
      persist({ ...settings, ...patch });
    },
    [persist, settings],
  );

  const value = useMemo(
    (): DisplaySettingsContextValue => ({
      ...settings,
      updateSettings,
      setShowProjects: (showProjects) => updateSettings({ showProjects }),
      setShowCases: (showCases) => updateSettings({ showCases }),
      setProjectLabel: (projectLabel) => updateSettings({ projectLabel }),
      setCaseLabel: (caseLabel) => updateSettings({ caseLabel }),
    }),
    [settings, updateSettings],
  );

  return (
    <DisplaySettingsContext.Provider value={value}>{children}</DisplaySettingsContext.Provider>
  );
}

const FALLBACK: DisplaySettingsContextValue = {
  ...DEFAULT_DISPLAY_SETTINGS,
  updateSettings: () => {},
  setShowProjects: () => {},
  setShowCases: () => {},
  setProjectLabel: () => {},
  setCaseLabel: () => {},
};

export function useDisplaySettings() {
  return useContext(DisplaySettingsContext) ?? FALLBACK;
}

export function SettingsToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="gyokan-muted">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-[var(--gyokan-accent2)]" : "bg-gray-200"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}
