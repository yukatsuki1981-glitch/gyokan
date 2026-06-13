export type GyokanThemeId =
  | "default"
  | "mono"
  | "forest"
  | "marine"
  | "sakura"
  | "sunset"
  | "momiji"
  | "yukigeshiki"
  | "kami"
  | "yofukashi"
  | "furikaeri";

export type GyokanThemeColors = {
  bg: string;
  bg2: string;
  surface: string;
  border: string;
  text: string;
  text2: string;
  accent: string;
  accent2: string;
  accentLt: string;
  highlight?: string;
};

export type GyokanThemeFonts = {
  display: string;
  body: string;
  mono: string;
};

export type GyokanTheme = {
  id: GyokanThemeId;
  name: string;
  free: boolean;
  colors: GyokanThemeColors;
  fonts: GyokanThemeFonts;
};

export const GYOKAN_THEME_STORAGE_KEY = "gyokan-theme";

export const DEFAULT_THEME_ID: GyokanThemeId = "default";

export function isThemeSelectable(theme: GyokanTheme, isPaidMember: boolean): boolean {
  return theme.free || isPaidMember;
}

export const GYOKAN_THEMES: GyokanTheme[] = [
  {
    id: "default",
    name: "デフォルト",
    free: true,
    colors: {
      bg: "#fafafa",
      bg2: "#f3f4f6",
      surface: "#ffffff",
      border: "#ececec",
      text: "#1d1d1f",
      text2: "#9ca3af",
      accent: "#0066DD",
      accent2: "#007AFF",
      accentLt: "#eff6ff",
    },
    fonts: {
      display: "var(--font-geist-sans)",
      body: "var(--font-geist-sans)",
      mono: "var(--font-geist-mono)",
    },
  },
  {
    id: "mono",
    name: "モノクロ／インク",
    free: true,
    colors: {
      bg: "#F5F5F5",
      bg2: "#EBEBEB",
      surface: "#FFFFFF",
      border: "#D9D9D9",
      text: "#1A1A1A",
      text2: "#595959",
      accent: "#1A1A1A",
      accent2: "#404040",
      accentLt: "#E8E8E8",
    },
    fonts: {
      display: "var(--font-noto-serif-jp)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "forest",
    name: "フォレスト",
    free: true,
    colors: {
      bg: "#F3F5EE",
      bg2: "#E6EBDC",
      surface: "#FCFDFA",
      border: "#D5DEC8",
      text: "#1F2A1A",
      text2: "#586350",
      accent: "#2E4A23",
      accent2: "#4F7A3E",
      accentLt: "#E3EEDB",
    },
    fonts: {
      display: "var(--font-shippori-mincho)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "marine",
    name: "マリーン",
    free: false,
    colors: {
      bg: "#F0F6F7",
      bg2: "#DCEBED",
      surface: "#FBFEFE",
      border: "#C2DEE2",
      text: "#16313A",
      text2: "#4D7480",
      accent: "#1B5E6D",
      accent2: "#2E8FA3",
      accentLt: "#DEF0F2",
      highlight: "#E97A5C",
    },
    fonts: {
      display: "var(--font-zen-maru-gothic)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "sakura",
    name: "サクラ",
    free: false,
    colors: {
      bg: "#FBF3F4",
      bg2: "#F6E4E7",
      surface: "#FFFCFC",
      border: "#EFD3D8",
      text: "#3A2429",
      text2: "#8A6770",
      accent: "#B85C72",
      accent2: "#D98A9C",
      accentLt: "#FBE6EA",
    },
    fonts: {
      display: "var(--font-zen-maru-gothic)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "sunset",
    name: "サンセット",
    free: false,
    colors: {
      bg: "#FDF3EC",
      bg2: "#FBE3D4",
      surface: "#FFFAF6",
      border: "#F2CDB0",
      text: "#3A2418",
      text2: "#8A5F45",
      accent: "#C2542E",
      accent2: "#E08A47",
      accentLt: "#FBE9DA",
      highlight: "#6B4A8A",
    },
    fonts: {
      display: "var(--font-shippori-mincho)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "momiji",
    name: "紅葉",
    free: false,
    colors: {
      bg: "#F8F0EB",
      bg2: "#EFDDD2",
      surface: "#FDFAF7",
      border: "#E0C5B5",
      text: "#3A211A",
      text2: "#8A6354",
      accent: "#A8432A",
      accent2: "#C9683F",
      accentLt: "#F5E0D5",
    },
    fonts: {
      display: "var(--font-shippori-mincho)",
      body: "var(--font-noto-serif-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "yukigeshiki",
    name: "雪景色",
    free: false,
    colors: {
      bg: "#F4F7FA",
      bg2: "#E5EDF3",
      surface: "#FFFFFF",
      border: "#D3E1EB",
      text: "#1E2A33",
      text2: "#5C7384",
      accent: "#3D6E8F",
      accent2: "#6FA3C2",
      accentLt: "#E3EEF5",
    },
    fonts: {
      display: "var(--font-noto-serif-jp)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "kami",
    name: "紙",
    free: false,
    colors: {
      bg: "#F7F2E6",
      bg2: "#EEE5D1",
      surface: "#FDFAF1",
      border: "#DDD0B5",
      text: "#2B2620",
      text2: "#6E6354",
      accent: "#4A3D2A",
      accent2: "#7A6A4D",
      accentLt: "#EFE7D4",
    },
    fonts: {
      display: "var(--font-shippori-mincho)",
      body: "var(--font-noto-serif-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "yofukashi",
    name: "夜更かしモード",
    free: false,
    colors: {
      bg: "#1C1B22",
      bg2: "#2A2832",
      surface: "#25232C",
      border: "#3A3744",
      text: "#EDEAF2",
      text2: "#A8A3B5",
      accent: "#9C8CD4",
      accent2: "#B6A8E0",
      accentLt: "#34304A",
    },
    fonts: {
      display: "var(--font-shippori-mincho)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
  {
    id: "furikaeri",
    name: "振り返りモード",
    free: false,
    colors: {
      bg: "#F5EFE6",
      bg2: "#E9DDC9",
      surface: "#FBF7F0",
      border: "#D8C7AC",
      text: "#3A3024",
      text2: "#807058",
      accent: "#8A6B3F",
      accent2: "#AD8C5C",
      accentLt: "#EFE4D0",
    },
    fonts: {
      display: "var(--font-noto-serif-jp)",
      body: "var(--font-noto-sans-jp)",
      mono: "var(--font-dm-mono)",
    },
  },
];

export function getThemeById(id: string | null | undefined): GyokanTheme {
  return GYOKAN_THEMES.find((t) => t.id === id) ?? GYOKAN_THEMES[0];
}

export function isFreeTheme(id: GyokanThemeId): boolean {
  return getThemeById(id).free;
}

export function readStoredThemeId(isPaidMember: boolean): GyokanThemeId {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const raw = localStorage.getItem(GYOKAN_THEME_STORAGE_KEY);
    if (!raw) return DEFAULT_THEME_ID;
    const theme = getThemeById(raw);
    if (!isThemeSelectable(theme, isPaidMember)) {
      return DEFAULT_THEME_ID;
    }
    return theme.id;
  } catch {
    return DEFAULT_THEME_ID;
  }
}

export function writeStoredThemeId(id: GyokanThemeId) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GYOKAN_THEME_STORAGE_KEY, id);
  } catch {
    /* ignore quota errors */
  }
}

export function applyThemeToDocument(theme: GyokanTheme) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  const { colors, fonts } = theme;
  root.style.setProperty("--gyokan-bg", colors.bg);
  root.style.setProperty("--gyokan-bg2", colors.bg2);
  root.style.setProperty("--gyokan-surface", colors.surface);
  root.style.setProperty("--gyokan-border", colors.border);
  root.style.setProperty("--gyokan-text", colors.text);
  root.style.setProperty("--gyokan-text2", colors.text2);
  root.style.setProperty("--gyokan-accent", colors.accent);
  root.style.setProperty("--gyokan-accent2", colors.accent2);
  root.style.setProperty("--gyokan-accent-lt", colors.accentLt);
  root.style.setProperty("--gyokan-highlight", colors.highlight ?? colors.accent2);
  root.style.setProperty("--gyokan-font-display", fonts.display);
  root.style.setProperty("--gyokan-font-body", fonts.body);
  root.style.setProperty("--gyokan-font-mono", fonts.mono);
  root.style.colorScheme = theme.id === "yofukashi" ? "dark" : "light";
}
