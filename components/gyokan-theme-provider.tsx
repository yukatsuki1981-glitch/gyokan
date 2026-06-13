"use client";

import { useCallback, useEffect, useState } from "react";
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
  setThemeId: (id: GyokanThemeId) => boolean;
};

let themeListeners: Array<(theme: GyokanTheme) => void> = [];

function notifyThemeListeners(theme: GyokanTheme) {
  for (const listener of themeListeners) listener(theme);
}

export function bootstrapGyokanTheme() {
  const id = readStoredThemeId();
  const theme = getThemeById(id);
  applyThemeToDocument(theme);
  return theme;
}

export function useGyokanTheme(): GyokanThemeContextValue {
  const [themeId, setThemeIdState] = useState<GyokanThemeId>(DEFAULT_THEME_ID);
  const [theme, setTheme] = useState<GyokanTheme>(() => getThemeById(DEFAULT_THEME_ID));

  useEffect(() => {
    const initial = bootstrapGyokanTheme();
    setThemeIdState(initial.id);
    setTheme(initial);

    const onStorage = (event: StorageEvent) => {
      if (event.key !== GYOKAN_THEME_STORAGE_KEY) return;
      const next = bootstrapGyokanTheme();
      setThemeIdState(next.id);
      setTheme(next);
    };

    const onThemeChange = (next: GyokanTheme) => {
      setThemeIdState(next.id);
      setTheme(next);
    };

    themeListeners.push(onThemeChange);
    window.addEventListener("storage", onStorage);
    return () => {
      themeListeners = themeListeners.filter((l) => l !== onThemeChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setThemeId = useCallback((id: GyokanThemeId) => {
    const next = getThemeById(id);
    if (!isThemeSelectable(next)) return false;
    writeStoredThemeId(id);
    applyThemeToDocument(next);
    setThemeIdState(id);
    setTheme(next);
    notifyThemeListeners(next);
    return true;
  }, []);

  return { theme, themeId, setThemeId };
}
