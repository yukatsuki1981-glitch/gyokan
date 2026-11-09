"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  createImeKeywordGate,
  isActiveQuery,
  searchEntries,
  type SearchableEntry,
  type SearchResult,
} from "@/lib/gyokan/search";

/** How many results are drawn at first; the rest come with 「さらに表示」. */
const RESULTS_PAGE = 50;

function formatResultDate(iso: string) {
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(d);
}

/** The magnifier button that opens / closes the search panel. */
export function JournalSearchButton({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? "検索を閉じる" : label}
      aria-expanded={open}
      className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
        open ? "bg-[#f0e8dc] text-[#6a5a48]" : "text-[#8a7a68] hover:bg-black/[0.04] hover:text-[#5a4a38]"
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4.5 4.5" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function ResultSnippet({ result }: { result: SearchResult }) {
  const { before, match, after, cutStart, cutEnd } = result.snippet;
  if (!before && !match && !after) {
    return <p className="text-[13px] text-[#a89880]">(文章なし)</p>;
  }
  return (
    <p className="line-clamp-2 text-[13px] leading-relaxed text-[#5a5048]">
      {cutStart && "…"}
      {before}
      {match && <mark className="rounded-sm bg-[#f6dd8a] px-0.5 text-[#3a3028]">{match}</mark>}
      {after}
      {cutEnd && "…"}
    </p>
  );
}

/**
 * Keyword + period search over `entries` (all dates), newest first. Kept
 * mounted while closed so the query and results survive opening the found
 * day and coming back.
 */
export function JournalSearchPanel({
  open,
  entries,
  onSelect,
  placeholder,
  sourceLabel,
}: {
  open: boolean;
  entries: SearchableEntry[];
  onSelect: (date: string) => void;
  placeholder: string;
  /** Small label per result (e.g. which kind of memo); none when it returns null. */
  sourceLabel?: (entry: SearchableEntry) => string | null;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const gateRef = useRef(createImeKeywordGate());
  const [draft, setDraft] = useState("");
  const [keyword, setKeyword] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [shown, setShown] = useState(RESULTS_PAGE);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const query = useDeferredValue(useMemo(() => ({ keyword, from, to }), [keyword, from, to]));
  const active = isActiveQuery(query);
  const results = useMemo(() => searchEntries(entries, query), [entries, query]);

  const commitKeyword = (value: string) => {
    setKeyword(value);
    setShown(RESULTS_PAGE);
  };

  return (
    <section
      hidden={!open}
      aria-label="検索"
      className="mb-4 rounded-2xl border border-black/[0.06] bg-white/80 p-3 shadow-[0_8px_24px_rgba(80,60,40,0.08)] backdrop-blur-sm"
    >
      <input
        ref={inputRef}
        type="search"
        value={draft}
        placeholder={placeholder}
        enterKeyHint="search"
        onCompositionStart={() => gateRef.current.onCompositionStart()}
        onCompositionEnd={(e) => commitKeyword(gateRef.current.onCompositionEnd(e.currentTarget.value))}
        onChange={(e) => {
          setDraft(e.target.value);
          const next = gateRef.current.onInput(
            e.target.value,
            (e.nativeEvent as InputEvent).isComposing ?? false,
          );
          if (next !== null) commitKeyword(next);
        }}
        className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[16px] text-gray-900 outline-none focus:border-[#c8b49c] sm:text-[14px]"
      />

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[13px] text-[#7a6a58]">
        <span className="shrink-0 text-[11px] font-medium text-[#a89880]">期間</span>
        <input
          type="date"
          aria-label="開始日"
          value={from}
          max={to || undefined}
          onChange={(e) => {
            setFrom(e.target.value);
            setShown(RESULTS_PAGE);
          }}
          className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-[13px] text-gray-900 outline-none"
        />
        <span className="shrink-0">〜</span>
        <input
          type="date"
          aria-label="終了日"
          value={to}
          min={from || undefined}
          onChange={(e) => {
            setTo(e.target.value);
            setShown(RESULTS_PAGE);
          }}
          className="min-w-0 flex-1 rounded-lg border border-black/[0.08] bg-white px-2 py-1.5 text-[13px] text-gray-900 outline-none"
        />
        <button
          type="button"
          onClick={() => {
            setFrom("");
            setTo("");
          }}
          disabled={!from && !to}
          className="shrink-0 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[#8a7058] hover:bg-black/[0.04] disabled:opacity-30"
        >
          クリア
        </button>
      </div>

      {active && (
        <div className="mt-3 border-t border-black/[0.05] pt-2">
          {results.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-[#a89880]">見つかりませんでした</p>
          ) : (
            <>
              <p className="mb-1 text-[11px] text-[#a89880]">{results.length}件</p>
              <ul className="max-h-[50dvh] overflow-y-auto overscroll-contain">
                {results.slice(0, shown).map((result) => {
                  const tag = sourceLabel?.(result.entry) ?? null;
                  return (
                    <li key={result.entry.id}>
                      <button
                        type="button"
                        onClick={() => onSelect(result.entry.date)}
                        className="w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-black/[0.03]"
                      >
                        <span className="mb-0.5 flex items-center gap-2 text-[11px] text-[#a08060]">
                          <time dateTime={result.entry.date}>{formatResultDate(result.entry.date)}</time>
                          {tag && (
                            <span className="truncate rounded-full bg-[#f0e8dc] px-2 py-0.5 text-[10px] text-[#6a5a48]">
                              {tag}
                            </span>
                          )}
                        </span>
                        <ResultSnippet result={result} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              {results.length > shown && (
                <button
                  type="button"
                  onClick={() => setShown((n) => n + RESULTS_PAGE)}
                  className="mt-1 w-full rounded-xl py-2 text-[12px] font-medium text-[#8a7058] hover:bg-black/[0.03]"
                >
                  さらに表示({results.length - shown}件)
                </button>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
