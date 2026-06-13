"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  applyThemeToDocument,
  DEFAULT_THEME_ID,
  getThemeById,
  GYOKAN_THEME_STORAGE_KEY,
  isThemeSelectable,
  readStoredThemeId,
  writeStoredThemeId,
  type GyokanTheme,
  type GyokanThemeId,
} from "@/lib/gyokan/themes";

type GyokanThemeContextValue = {
  theme: GyokanTheme;
  themeId: GyokanThemeId;
  isPaidMember: boolean;
  setThemeId: (id: GyokanThemeId) => boolean;
};

const GyokanThemeContext = createContext<GyokanThemeContextValue | null>(null);

let themeListeners: Array<(theme: GyokanTheme) => void> = [];

function notifyThemeListeners(theme: GyokanTheme) {
  for (const listener of themeListeners) listener(theme);
}

function applyStoredTheme(isPaidMember: boolean) {
  const id = readStoredThemeId(isPaidMember);
  const theme = getThemeById(id);
  applyThemeToDocument(theme);
  return theme;
}

export function GyokanThemeProvider({
  isPaidMember,
  children,
}: {
  isPaidMember: boolean;
  children: ReactNode;
}) {
  const [themeId, setThemeIdState] = useState<GyokanThemeId>(DEFAULT_THEME_ID);
  const [theme, setTheme] = useState<GyokanTheme>(() => getThemeById(DEFAULT_THEME_ID));

  useEffect(() => {
    const next = applyStoredTheme(isPaidMember);
    setThemeIdState(next.id);
    setTheme(next);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== GYOKAN_THEME_STORAGE_KEY) return;
      const stored = applyStoredTheme(isPaidMember);
      setThemeIdState(stored.id);
      setTheme(stored);
    };

    const onThemeChange = (changed: GyokanTheme) => {
      setThemeIdState(changed.id);
      setTheme(changed);
    };

    themeListeners.push(onThemeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      themeListeners = themeListeners.filter((l) => l !== onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, [isPaidMember]);

  const setThemeId = useCallback(
    (id: GyokanThemeId) => {
      const next = getThemeById(id);
      if (!isThemeSelectable(next, isPaidMember)) return false;
      writeStoredThemeId(id);
      applyThemeToDocument(next);
      setThemeIdState(id);
      setTheme(next);
      notifyThemeListeners(next);
      return true;
    },
    [isPaidMember],
  );

  return (
    <GyokanThemeContext.Provider value={{ theme, themeId, isPaidMember, setThemeId }}>
      {children}
    </GyokanThemeContext.Provider>
  );
}

export function useGyokanTheme(): GyokanThemeContextValue {
  const ctx = useContext(GyokanThemeContext);
  if (!ctx) {
    throw new Error("useGyokanTheme must be used within GyokanThemeProvider");
  }
  return ctx;
}
