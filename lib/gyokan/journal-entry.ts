import type { AppDailyDiary } from "./types";

export type JournalPhoto = {
  id: string;
  dataUrl: string;
  rotation: number;
};

export type JournalEntry = {
  version: 1;
  weather?: string;
  moodEmoji?: string;
  moodLabel?: string;
  text: string;
  photos: JournalPhoto[];
};

const EMPTY_ENTRY: JournalEntry = {
  version: 1,
  text: "",
  photos: [],
};

export function createEmptyJournalEntry(): JournalEntry {
  return { ...EMPTY_ENTRY, photos: [] };
}

export function isJournalEntryEmpty(entry: JournalEntry) {
  return (
    !entry.text.trim() &&
    !entry.moodLabel?.trim() &&
    !entry.moodEmoji?.trim() &&
    !entry.weather?.trim() &&
    entry.photos.length === 0
  );
}

export function parseJournalEntry(body: string): JournalEntry {
  const trimmed = body.trim();
  if (!trimmed) return createEmptyJournalEntry();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<JournalEntry>;
      if (parsed && typeof parsed === "object" && parsed.version === 1) {
        return {
          version: 1,
          weather: typeof parsed.weather === "string" ? parsed.weather : undefined,
          moodEmoji: typeof parsed.moodEmoji === "string" ? parsed.moodEmoji : undefined,
          moodLabel: typeof parsed.moodLabel === "string" ? parsed.moodLabel : undefined,
          text: typeof parsed.text === "string" ? parsed.text : "",
          photos: Array.isArray(parsed.photos)
            ? parsed.photos
                .filter(
                  (p): p is JournalPhoto =>
                    !!p &&
                    typeof p === "object" &&
                    typeof (p as JournalPhoto).id === "string" &&
                    typeof (p as JournalPhoto).dataUrl === "string",
                )
                .map((p) => ({
                  id: p.id,
                  dataUrl: p.dataUrl,
                  rotation: typeof p.rotation === "number" ? p.rotation : 0,
                }))
            : [],
        };
      }
    } catch {
      // fall through to plain text
    }
  }
  return { version: 1, text: body, photos: [] };
}

export function serializeJournalEntry(entry: JournalEntry): string {
  if (isJournalEntryEmpty(entry)) return "";
  return JSON.stringify({
    version: 1,
    weather: entry.weather || undefined,
    moodEmoji: entry.moodEmoji || undefined,
    moodLabel: entry.moodLabel || undefined,
    text: entry.text,
    photos: entry.photos,
  });
}

export function getDiaryEntryForDate(
  diaries: AppDailyDiary[],
  date: string,
): JournalEntry {
  const sameDay = diaries
    .filter((d) => d.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (sameDay.length === 0) return createEmptyJournalEntry();
  const bodies = sameDay.map((d) => d.body.trim()).filter(Boolean);
  if (bodies.length === 0) return createEmptyJournalEntry();
  if (bodies.length === 1) return parseJournalEntry(bodies[0]);
  return parseJournalEntry(
    bodies
      .map((b) => {
        const e = parseJournalEntry(b);
        return e.text.trim();
      })
      .filter(Boolean)
      .join("\n"),
  );
}

export function hasDiaryContent(diaries: AppDailyDiary[], date: string) {
  return !isJournalEntryEmpty(getDiaryEntryForDate(diaries, date));
}

export const WEATHER_OPTIONS = ["☀️", "⛅", "☁️", "🌧️", "❄️", "🌈", "🌙"];

export const MOOD_PRESETS: { emoji: string; label: string; color: string }[] = [
  { emoji: "😊", label: "落ち着いた一日", color: "#e8f4ea" },
  { emoji: "😌", label: "穏やか", color: "#e8eef4" },
  { emoji: "🥳", label: "楽しかった", color: "#fef3e2" },
  { emoji: "😤", label: "忙しかった", color: "#fce8e8" },
  { emoji: "😴", label: "ゆっくり休めた", color: "#f0ebf8" },
  { emoji: "🤔", label: "考え事", color: "#f4f0e8" },
];
