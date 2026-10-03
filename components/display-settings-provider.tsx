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
  setHomeCaseColumns: (value: number) => void;
  setDefaultEventColor: (value: string) => void;
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
      setHomeCaseColumns: (homeCaseColumns) => updateSettings({ homeCaseColumns }),
      setDefaultEventColor: (defaultEventColor) => updateSettings({ defaultEventColor }),
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
  setHomeCaseColumns: () => {},
  setDefaultEventColor: () => {},
};

export function useDisplaySettings() {
  return useContext(DisplaySettingsContext) ?? FALLBACK;
}
