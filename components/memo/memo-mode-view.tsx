"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { memoSearchEntries, type SearchableEntry } from "@/lib/gyokan/search";
import type { AppDailyMemo, AppMemo } from "@/lib/gyokan/types";
import { JournalSearchButton, JournalSearchPanel } from "@/components/search/journal-search";
import {
  JournalDotIndicator,
  JournalMobilePager,
  JournalNavArrow,
  JournalPageDateHeader,
  JournalSpine,
  JournalSpread,
} from "@/components/diary/journal-page";
import "@/components/diary/diary-journal.css";

type PageSide = "single" | "left" | "right";

/** One day of memos: the daily memo, then each project memo with its project name. */
function MemoPage({
  date,
  entries,
  side,
  inSpread = false,
  onCornerNext,
}: {
  date: string;
  entries: SearchableEntry[];
  side: PageSide;
  inSpread?: boolean;
  onCornerNext?: () => void;
}) {
  const daily = entries.find((e) => e.source === "daily_memo");
  const project = entries.filter((e) => e.source === "project_memo");
  const rounded =
    side === "left" ? "rounded-l-sm rounded-r-none" : side === "right" ? "rounded-r-sm rounded-l-none" : "rounded-sm";
  const paperClass = inSpread
    ? `journal-paper--in-spread journal-paper--${side}`
    : side === "single"
      ? "journal-paper--single min-h-[min(72vh,640px)]"
      : `journal-paper--${side} min-h-[min(72vh,640px)]`;

  return (
    <article className={`journal-paper relative flex flex-1 flex-col overflow-hidden ${paperClass} ${rounded}`}>
      <JournalPageDateHeader date={date} />
      <div className="journal-paper-lines relative z-[1] min-h-0 flex-1 overflow-y-auto">
        <div className="journal-lined-content">
          {daily && <p className="journal-body-text">{daily.text}</p>}
          {project.map((memo) => (
            <div key={memo.id}>
              <p className="journal-body-text text-[#a08060]">【{memo.label}】</p>
              <p className="journal-body-text">{memo.text}</p>
            </div>
          ))}
          {!daily && project.length === 0 && (
            <p className="journal-body-text text-[#a89880]">メモはありません</p>
          )}
        </div>
      </div>
      {onCornerNext && (
        <button
          type="button"
          className="journal-page-fold z-[2]"
          onClick={onCornerNext}
          aria-label="次の日へ"
        />
      )}
    </article>
  );
}

/**
 * 「全てのメモを見る」: every day that has a daily memo or a project memo, as
 * pages — two at a time on wide screens, swiped one by one on phones — with
 * the same search as the diary.
 */
export function MemoModeView({
  dailyMemos,
  projectMemos,
  initialDate,
}: {
  dailyMemos: AppDailyMemo[];
  projectMemos: AppMemo[];
  initialDate?: string;
}) {
  const entries = useMemo(() => memoSearchEntries(dailyMemos, projectMemos), [dailyMemos, projectMemos]);
  const entriesByDate = useMemo(() => {
    const map = new Map<string, SearchableEntry[]>();
    for (const entry of entries) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.label ?? "").localeCompare(b.label ?? ""));
    return map;
  }, [entries]);
  const dates = useMemo(() => [...entriesByDate.keys()].sort(), [entriesByDate]);

  const [spreadIndex, setSpreadIndex] = useState(0);
  const [isWide, setIsWide] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const pageStep = isWide ? 2 : 1;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (dates.length === 0) {
      setSpreadIndex(0);
      return;
    }
    let targetIdx = dates.length - 1;
    if (initialDate) {
      const idx = dates.indexOf(initialDate);
      if (idx >= 0) targetIdx = idx;
    }
    setSpreadIndex(isWide && targetIdx > 0 ? targetIdx - 1 : targetIdx);
  }, [dates, initialDate, isWide]);

  /** Opens the page of `date` (on wide screens, as the right-hand page like the initial view). */
  const showDate = (date: string) => {
    const idx = dates.indexOf(date);
    if (idx >= 0) setSpreadIndex(isWide && idx > 0 ? idx - 1 : idx);
  };

  const leftDate = dates[spreadIndex];
  const rightDate = isWide ? dates[spreadIndex + 1] : undefined;
  const canGoPrev = spreadIndex > 0;
  const canGoNext = spreadIndex + pageStep < dates.length;

  const goPrev = useCallback(() => setSpreadIndex((i) => Math.max(0, i - pageStep)), [pageStep]);
  const goNext = useCallback(
    () => setSpreadIndex((i) => Math.min(dates.length - 1, i + pageStep)),
    [dates.length, pageStep],
  );

  const pageFor = (date: string, side: PageSide, inSpread: boolean, onCornerNext?: () => void) => (
    <MemoPage
      date={date}
      entries={entriesByDate.get(date) ?? []}
      side={side}
      inSpread={inSpread}
      onCornerNext={onCornerNext}
    />
  );

  return (
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col">
      <nav className="mb-4 flex items-center gap-1 border-b border-black/[0.06] pb-3">
        <Link
          href="/"
          className="rounded-lg px-3 py-1.5 text-[13px] text-[var(--gyokan-muted,#8a8a8a)] transition-colors hover:bg-black/[0.03] hover:text-[var(--gyokan-text)]"
        >
          タスク管理
        </Link>
        <span className="text-[#d0c8bc]">/</span>
        <span className="rounded-lg bg-[#f0e8dc] px-3 py-1.5 text-[13px] font-semibold text-[#6a5a48]">メモ</span>
        <span className="ml-auto flex items-center">
          <JournalSearchButton open={searchOpen} onToggle={() => setSearchOpen((v) => !v)} label="メモを検索" />
        </span>
      </nav>

      <JournalSearchPanel
        open={searchOpen}
        entries={entries}
        placeholder="メモをキーワードで検索"
        sourceLabel={(entry) => (entry.source === "project_memo" ? entry.label ?? null : "日ごとのメモ")}
        onSelect={(date) => {
          showDate(date);
          setSearchOpen(false);
        }}
      />

      <div className="flex flex-1 flex-col">
        {dates.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-[#a89880]">まだメモがありません</p>
        ) : (
          <>
            <div className="flex min-h-0 flex-1 items-center gap-1 px-0 sm:px-2">
              {isWide && <JournalNavArrow direction="prev" onClick={goPrev} disabled={!canGoPrev} label="前のページ" />}

              {isWide ? (
                <JournalSpread>
                  {leftDate && pageFor(leftDate, "left", true)}
                  {rightDate ? (
                    <>
                      <JournalSpine />
                      {pageFor(rightDate, "right", true, canGoNext ? goNext : undefined)}
                    </>
                  ) : leftDate ? (
                    <>
                      <JournalSpine />
                      <div className="flex-1" aria-hidden />
                    </>
                  ) : null}
                </JournalSpread>
              ) : (
                <JournalMobilePager
                  dates={dates}
                  activeIndex={spreadIndex}
                  onIndexChange={setSpreadIndex}
                  renderPage={(date, onCornerNext) => pageFor(date, "single", false, onCornerNext)}
                />
              )}

              {isWide && <JournalNavArrow direction="next" onClick={goNext} disabled={!canGoNext} label="次のページ" />}
            </div>

            {!isWide && leftDate && <JournalDotIndicator dates={dates} focusDate={leftDate} />}
          </>
        )}
      </div>
    </div>
  );
}
