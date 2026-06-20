"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { todayISO } from "@/lib/gyokan/iso-date";
import {
  getFilledDiaryDates,
  type JournalEntry,
} from "@/lib/gyokan/journal-entry";
import type { AppDailyDiary } from "@/lib/gyokan/types";
import { JournalEditorSheet } from "./journal-editor-sheet";
import {
  JournalDotIndicator,
  JournalMobileDateNav,
  JournalMobilePager,
  JournalNavArrow,
  JournalPage,
  JournalSpine,
  JournalSpread,
} from "./journal-page";

export function DiaryModeView({
  diaries,
  onSave,
  initialDate,
}: {
  diaries: AppDailyDiary[];
  onSave: (date: string, entry: JournalEntry) => Promise<boolean>;
  initialDate?: string;
}) {
  const filledDates = useMemo(() => getFilledDiaryDates(diaries), [diaries]);
  const [spreadIndex, setSpreadIndex] = useState(0);
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [pendingFocusDate, setPendingFocusDate] = useState<string | null>(null);
  const [isWide, setIsWide] = useState(false);

  const pageStep = isWide ? 2 : 1;

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (filledDates.length === 0) {
      setSpreadIndex(0);
      return;
    }
    let targetIdx = filledDates.length - 1;
    if (initialDate) {
      const idx = filledDates.indexOf(initialDate);
      if (idx >= 0) targetIdx = idx;
    }
    setSpreadIndex(isWide && targetIdx > 0 ? targetIdx - 1 : targetIdx);
  }, [filledDates, initialDate, isWide]);

  useEffect(() => {
    if (!pendingFocusDate) return;
    const idx = filledDates.indexOf(pendingFocusDate);
    if (idx >= 0) {
      setSpreadIndex(isWide && idx > 0 ? idx - 1 : idx);
      setPendingFocusDate(null);
    }
  }, [filledDates, pendingFocusDate, isWide]);

  const leftDate = filledDates[spreadIndex];
  const rightDate = isWide ? filledDates[spreadIndex + 1] : undefined;
  const mobileDate = filledDates[spreadIndex];
  const canGoPrev = spreadIndex > 0;
  const canGoNext = spreadIndex + pageStep < filledDates.length;

  const goPrev = useCallback(() => {
    setSpreadIndex((i) => Math.max(0, i - pageStep));
  }, [pageStep]);

  const goNext = useCallback(() => {
    setSpreadIndex((i) => Math.min(filledDates.length - 1, i + pageStep));
  }, [filledDates.length, pageStep]);

  const openEditor = useCallback((date: string) => {
    setEditorDate(date);
  }, []);

  const handleEditorClose = useCallback(() => {
    setEditorDate(null);
  }, []);

  const handleSave = useCallback(
    async (date: string, entry: JournalEntry) => {
      const ok = await onSave(date, entry);
      if (ok) {
        setPendingFocusDate(date);
      }
      return ok;
    },
    [onSave],
  );

  const dotDates = useMemo(() => {
    if (filledDates.length === 0) return [];
    const focusDate = mobileDate ?? filledDates[0];
    const idx = filledDates.indexOf(focusDate);
    const windowStart = Math.max(0, Math.min(idx - 1, filledDates.length - 3));
    return filledDates.slice(windowStart, windowStart + 3);
  }, [filledDates, mobileDate]);

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
        <span
          className="journal-body-text rounded-lg bg-[#f0e8dc] px-3 py-1.5 text-[13px] font-semibold text-[#6a5a48]"
        >
          日記
        </span>
      </nav>

      <div className="flex flex-1 flex-col">
        {filledDates.length === 0 ? (
          <p className="py-16 text-center text-[14px] text-[#a89880]">
            まだ日記がありません
          </p>
        ) : (
          <>
            {!isWide && mobileDate && (
              <JournalMobileDateNav
                date={mobileDate}
                onPrev={goPrev}
                onNext={goNext}
                canGoPrev={canGoPrev}
                canGoNext={canGoNext}
              />
            )}

            <div className="flex min-h-0 flex-1 items-center gap-1 px-0 sm:px-2">
              {isWide && (
                <JournalNavArrow
                  direction="prev"
                  onClick={goPrev}
                  disabled={!canGoPrev}
                  label="前のページ"
                />
              )}

              {isWide ? (
                <JournalSpread>
                  {leftDate && (
                    <JournalPage
                      date={leftDate}
                      diaries={diaries}
                      side="left"
                      inSpread
                      onEdit={() => openEditor(leftDate)}
                    />
                  )}
                  {rightDate ? (
                    <>
                      <JournalSpine />
                      <JournalPage
                        date={rightDate}
                        diaries={diaries}
                        side="right"
                        inSpread
                        onCornerNext={canGoNext ? goNext : undefined}
                        onEdit={() => openEditor(rightDate)}
                      />
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
                  dates={filledDates}
                  activeIndex={spreadIndex}
                  onIndexChange={setSpreadIndex}
                  diaries={diaries}
                  onEdit={openEditor}
                />
              )}

              {isWide && (
                <JournalNavArrow
                  direction="next"
                  onClick={goNext}
                  disabled={!canGoNext}
                  label="次のページ"
                />
              )}
            </div>

            {!isWide && mobileDate && (
              <JournalDotIndicator dates={dotDates} focusDate={mobileDate} />
            )}
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => openEditor(todayISO())}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#8a7058] text-[28px] font-light leading-none text-white shadow-[0_4px_20px_rgba(80,60,40,0.35)] transition-transform hover:scale-105 active:scale-95 lg:bottom-8"
        aria-label="新しい日記を書く"
      >
        +
      </button>

      {editorDate && (
        <JournalEditorSheet
          date={editorDate}
          diaries={diaries}
          onSave={handleSave}
          onClose={handleEditorClose}
        />
      )}
    </div>
  );
}
