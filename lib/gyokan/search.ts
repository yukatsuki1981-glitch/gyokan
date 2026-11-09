import { toISODate } from "./iso-date";
import { getDiaryEntryForDate, isJournalEntryEmpty } from "./journal-entry";
import type { AppDailyDiary, AppDailyMemo, AppMemo } from "./types";

/**
 * Keyword + date-range search over diaries and memos, done in the browser:
 * the app already loads every diary and memo of the signed-in user (all
 * dates), so no extra query or DB change is needed.
 */

export type SearchSource = "diary" | "daily_memo" | "project_memo";

export type SearchableEntry = {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  text: string;
  source: SearchSource;
  /** e.g. the project name of a project memo */
  label?: string;
};

export type SearchQuery = {
  keyword: string;
  /** YYYY-MM-DD or "" */
  from: string;
  /** YYYY-MM-DD or "" */
  to: string;
};

export type SearchSnippet = {
  before: string;
  match: string;
  after: string;
  /** Text was cut before `before` / after `after`. */
  cutStart: boolean;
  cutEnd: boolean;
};

export type SearchResult = {
  entry: SearchableEntry;
  snippet: SearchSnippet;
};

// ─── Normalization ───────────────────────────────────────────────────────────

const COMBINING_KANA_MARKS = /[゙゚]/;

/**
 * Case- and width-insensitive form of `text`, plus, for every UTF-16 unit of
 * the result, the index in `text` it came from (so a match can be highlighted
 * in the original). NFKC folds full-width ↔ half-width (ＡＢＣ/ABC, ｶﾞ/ガ,
 * １/1); lower-casing folds ABC/abc.
 */
export function normalizeWithMap(
  text: string,
  /** Stop once this many normalized units are produced (the rest isn't needed). */
  limit = Infinity,
): { normalized: string; map: number[] } {
  let normalized = "";
  const map: number[] = [];
  let i = 0;
  while (i < text.length && normalized.length < limit) {
    const cp = text.codePointAt(i)!;
    const ch = String.fromCodePoint(cp);
    const n = ch.normalize("NFKC").toLowerCase();
    // Half-width kana + (half-width) voiced mark: NFKC turns the mark into a
    // combining one; compose it with the kana before it, as NFKC does for
    // the whole string ("ｶﾞ" → "ガ").
    if (COMBINING_KANA_MARKS.test(n) && normalized.length > 0) {
      const composed = (normalized.slice(-1) + n).normalize("NFC");
      if (composed.length === 1) {
        normalized = normalized.slice(0, -1) + composed;
        i += ch.length;
        continue;
      }
    }
    for (let k = 0; k < n.length; k++) map.push(i);
    normalized += n;
    i += ch.length;
  }
  return { normalized, map };
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().normalize("NFKC").toLowerCase();
}

// ─── Snippets ────────────────────────────────────────────────────────────────

const SNIPPET_BEFORE = 20;
const SNIPPET_AFTER = 40;
const SNIPPET_PLAIN = 60;

const oneLine = (s: string) => s.replace(/\s+/g, " ");

function snippetAround(text: string, start: number, end: number): SearchSnippet {
  const from = Math.max(0, start - SNIPPET_BEFORE);
  const to = Math.min(text.length, end + SNIPPET_AFTER);
  return {
    before: oneLine(text.slice(from, start)).trimStart(),
    match: oneLine(text.slice(start, end)),
    after: oneLine(text.slice(end, to)).trimEnd(),
    cutStart: from > 0,
    cutEnd: to < text.length,
  };
}

function snippetFromStart(text: string): SearchSnippet {
  const trimmed = text.trim();
  return {
    before: oneLine(trimmed.slice(0, SNIPPET_PLAIN)),
    match: "",
    after: "",
    cutStart: false,
    cutEnd: trimmed.length > SNIPPET_PLAIN,
  };
}

/** Where `keyword` (already normalized) first occurs in `text`, as a range of `text`; null if not at all. */
export function findMatch(
  text: string,
  normalizedKeyword: string,
  /** Where the keyword is in text.normalize("NFKC").toLowerCase(), if known: only that much is mapped. */
  hintAt?: number,
): { start: number; end: number } | null {
  if (!normalizedKeyword) return null;
  let prepared =
    hintAt !== undefined
      ? normalizeWithMap(text, hintAt + normalizedKeyword.length + 8)
      : normalizeWithMap(text);
  let at = prepared.normalized.indexOf(normalizedKeyword);
  if (at < 0 && hintAt !== undefined) {
    prepared = normalizeWithMap(text);
    at = prepared.normalized.indexOf(normalizedKeyword);
  }
  if (at < 0) return null;
  const { map } = prepared;
  const start = map[at];
  // The match ends where the next source character begins — after the whole
  // character the last matched unit came from (a composed ｶﾞ spans two).
  const lastSource = map[at + normalizedKeyword.length - 1];
  // Without a later mapped unit (end of text, or of the partial map): the end
  // of that character, plus a voiced mark that was composed into it.
  let end = lastSource + String.fromCodePoint(text.codePointAt(lastSource)!).length;
  if (end < text.length && COMBINING_KANA_MARKS.test(text[end].normalize("NFKC"))) end += 1;
  for (let j = at + normalizedKeyword.length; j < map.length; j++) {
    if (map[j] > lastSource) {
      end = map[j];
      break;
    }
  }
  return { start, end };
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** True when there is anything to search for (a keyword or at least one date). */
export function isActiveQuery(query: SearchQuery): boolean {
  return !!normalizeKeyword(query.keyword) || !!query.from || !!query.to;
}

const SOURCE_ORDER: Record<SearchSource, number> = { diary: 0, daily_memo: 1, project_memo: 2 };

// Normalized text per entry object, so typing a keyword doesn't re-normalize
// every entry on each keystroke (entries are rebuilt only when data changes).
// Matching uses the whole-string form (fast); the per-character map needed to
// highlight is built only for entries that matched.
const normalizedCache = new WeakMap<SearchableEntry, string>();

function normalizedText(entry: SearchableEntry) {
  let hit = normalizedCache.get(entry);
  if (hit === undefined) {
    hit = entry.text.normalize("NFKC").toLowerCase();
    normalizedCache.set(entry, hit);
  }
  return hit;
}

/**
 * Entries matching the keyword (substring, case/width-insensitive) within the
 * date range (either end optional; reversed ends are swapped), newest date
 * first. A query with no keyword and no dates returns nothing.
 */
export function searchEntries(entries: SearchableEntry[], query: SearchQuery): SearchResult[] {
  if (!isActiveQuery(query)) return [];
  const keyword = normalizeKeyword(query.keyword);
  let { from, to } = query;
  if (from && to && from > to) [from, to] = [to, from];

  const results: SearchResult[] = [];
  for (const entry of entries) {
    if (from && entry.date < from) continue;
    if (to && entry.date > to) continue;
    if (!keyword) {
      results.push({ entry, snippet: snippetFromStart(entry.text) });
      continue;
    }
    const at = normalizedText(entry).indexOf(keyword);
    if (at < 0) continue;
    const m = findMatch(entry.text, keyword, at);
    // (m is null only if per-character folding differs from the whole-string
    // one for some exotic text; still a hit, shown from the start.)
    results.push({ entry, snippet: m ? snippetAround(entry.text, m.start, m.end) : snippetFromStart(entry.text) });
  }
  return results.sort(
    (a, b) =>
      b.entry.date.localeCompare(a.entry.date) ||
      SOURCE_ORDER[a.entry.source] - SOURCE_ORDER[b.entry.source] ||
      (a.entry.label ?? "").localeCompare(b.entry.label ?? ""),
  );
}

// ─── Building the searchable entries ─────────────────────────────────────────

function joinSameDay<T extends { date: string; body: string; createdAt: string }>(rows: T[]): Map<string, string> {
  const byDate = new Map<string, T[]>();
  for (const row of rows) {
    const list = byDate.get(row.date) ?? [];
    list.push(row);
    byDate.set(row.date, list);
  }
  const out = new Map<string, string>();
  for (const [date, list] of byDate) {
    out.set(
      date,
      list
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => r.body.trim())
        .filter(Boolean)
        .join("\n"),
    );
  }
  return out;
}

/** One entry per day, as the diary page shows it: the text and the mood words (not the photos). */
export function diarySearchEntries(diaries: AppDailyDiary[]): SearchableEntry[] {
  const dates = [...new Set(diaries.map((d) => d.date))];
  const out: SearchableEntry[] = [];
  for (const date of dates) {
    // diary_date is a date column (always YYYY-MM-DD); checked anyway so a
    // bad value can never reach the date formatting of the result list.
    if (!toISODate(date)) continue;
    const entry = getDiaryEntryForDate(diaries, date);
    // Same days the diary pages show (a photo-only day has no text, but is
    // still found by a period-only search).
    if (isJournalEntryEmpty(entry)) continue;
    const text = [entry.moodLabel?.trim(), entry.text.trim()].filter(Boolean).join("\n");
    out.push({ id: `diary:${date}`, date, text, source: "diary" });
  }
  return out;
}

/**
 * Daily memos (one entry per day, as the memo board joins them) and project
 * memos (one entry each). Dates come out as YYYY-MM-DD: project memos store
 * theirs as text like "2026.10.27" (daily memos use a date column). A memo
 * whose date can't be read is left out — it has no day to be shown on.
 */
export function memoSearchEntries(dailyMemos: AppDailyMemo[], projectMemos: AppMemo[]): SearchableEntry[] {
  const daily: SearchableEntry[] = [];
  for (const [rawDate, text] of joinSameDay(dailyMemos)) {
    const date = toISODate(rawDate);
    if (!date || !text.trim()) continue;
    daily.push({ id: `daily_memo:${date}`, date, text, source: "daily_memo" });
  }
  const project: SearchableEntry[] = [];
  for (const m of projectMemos) {
    const date = toISODate(m.date);
    if (!date || !m.body.trim()) continue;
    project.push({ id: `project_memo:${m.id}`, date, text: m.body, source: "project_memo", label: m.project });
  }
  return [...daily, ...project];
}

// ─── IME-aware input ─────────────────────────────────────────────────────────

/**
 * Decides when typed text becomes the search keyword: never while an IME is
 * composing (変換中), and with the final text once composition ends.
 * `onInput` returns the keyword to search for, or null to leave it as is.
 */
export function createImeKeywordGate() {
  let composing = false;
  return {
    onCompositionStart() {
      composing = true;
    },
    /** `nativeComposing` is InputEvent.isComposing, when the browser provides it. */
    onInput(value: string, nativeComposing = false): string | null {
      if (composing || nativeComposing) return null;
      return value;
    },
    onCompositionEnd(value: string): string {
      composing = false;
      return value;
    },
    get composing() {
      return composing;
    },
  };
}
