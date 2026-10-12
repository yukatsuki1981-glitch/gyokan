// A fixed 10-color palette for private-mode event labels — distinct from
// tasks mode's free-form HSL project-color picker (app/page.tsx), per the
// request for a simple 10-swatch choice here instead.

// Fixed display order — the default (emerald) always comes first; this
// order never changes based on which color is currently selected.
export const EVENT_COLOR_PALETTE: string[] = [
  "#10B981", // emerald (default, matches the prior hardcoded chip color)
  "#EF4444", // red
  "#F97316", // orange
  "#F59E0B", // amber
  "#EAB308", // yellow
  "#14B8A6", // teal
  "#3B82F6", // blue
  "#6366F1", // indigo
  "#A855F7", // purple
  "#EC4899", // pink
];

export const DEFAULT_EVENT_COLOR = EVENT_COLOR_PALETTE[0];

export type EventColorStyle = {
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
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function isValidHex(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

/** WCAG relative luminance of a hex color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex) ?? [0, 0, 0];
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two hex colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The color pushed toward black just far enough that white text on it
 * reaches `minContrast` (WCAG; 4.5 = AA for normal text). A color that
 * already gets there is returned unchanged, so deep colors stay as they are
 * and light ones (yellow, orange) darken the most. Computed, not tabled, so
 * new palette colors work too.
 */
export function darkenForWhiteText(hex: string, minContrast = 4.5): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  for (let step = 0; step <= 100; step++) {
    const keep = 1 - step / 100;
    const candidate = `#${rgb
      .map((v) => Math.round(v * keep).toString(16).padStart(2, "0"))
      .join("")}`.toUpperCase();
    if (contrastRatio(candidate, "#FFFFFF") >= minContrast) return candidate;
  }
  return "#000000";
}

/** Background for the white start-time badge on a timed event's chip: the label color, darkened for white text. */
export function eventTimeBadgeColor(accentHex: string | null | undefined): string {
  return darkenForWhiteText(eventColorStyle(accentHex).accent);
}

/** Derives a soft background + readable text color from an accent hex —
 * same technique as tasks mode's project-color styling, so event chips look
 * consistent with the rest of the app's tag/badge design. */
export function eventColorStyle(accentHex: string | null | undefined): EventColorStyle {
  const normalized = accentHex && isValidHex(accentHex) ? accentHex.toUpperCase() : DEFAULT_EVENT_COLOR;
  const [h, s, l] = hexToHsl(normalized);
  return {
    accent: normalized,
    bg: hslToHex(h, Math.min(s, 38), 93),
    text: hslToHex(h, Math.max(s, 45), Math.max(l - 18, 22)),
  };
}
