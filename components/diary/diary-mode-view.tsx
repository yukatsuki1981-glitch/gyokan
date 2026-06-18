"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { shiftISODate, todayISO } from "@/lib/gyokan/iso-date";
import type { JournalEntry } from "@/lib/gyokan/journal-entry";
import type { AppDailyDiary } from "@/lib/gyokan/types";
import { JournalEditorSheet } from "./journal-editor-sheet";
import {
  JournalDotIndicator,
  JournalMobileDateNav,
  JournalNavArrow,
  JournalPage,
  JournalSpine,
} from "./journal-page";

function buildDotDates(focusDate: string, count = 5) {
  const dates: string[] = [];
  const half = Math.floor(count / 2);
  for (let i = -half; i <= half; i++) {
    dates.push(shiftISODate(focusDate, i));
  }
  return dates;
}

export function DiaryModeView({
  diaries,
  onSave,
  initialDate,
}: {
  diaries: AppDailyDiary[];
  onSave: (date: string, entry: JournalEntry) => Promise<boolean>;
  initialDate?: string;
}) {
  const [focusDate, setFocusDate] = useState(initialDate ?? todayISO());
  const [editorDate, setEditorDate] = useState<string | null>(null);
  const [isWide, setIsWide] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsWide(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const leftDate = shiftISODate(focusDate, -1);
  const rightDate = focusDate;
  const dotDates = useMemo(() => buildDotDates(focusDate), [focusDate]);

  const goPrev = useCallback(() => {
    setFocusDate((d) => shiftISODate(d, isWide ? -1 : -1));
  }, [isWide]);

  const goNext = useCallback(() => {
    setFocusDate((d) => shiftISODate(d, 1));
  }, []);

  const openEditor = useCallback((date: string) => {
    setEditorDate(date);
  }, []);

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
          className="rounded-lg bg-[#f0e8dc] px-3 py-1.5 text-[13px] font-medium text-[#6a5a48]"
          style={{ fontFamily: "var(--font-shippori-mincho), serif" }}
        >
          日記モード
        </span>
      </nav>

      <div className="flex flex-1 flex-col">
        {!isWide && (
          <JournalMobileDateNav
            date={focusDate}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}

        <div className="flex flex-1 items-stretch gap-1 px-0 sm:px-2">
          {isWide && (
            <JournalNavArrow
              direction="prev"
              onClick={goPrev}
              label="前のページ"
            />
          )}

          {isWide ? (
            <div className="flex min-h-0 flex-1 items-stretch">
              <JournalPage
                date={leftDate}
                diaries={diaries}
                side="left"
                onEdit={() => openEditor(leftDate)}
              />
              <JournalSpine />
              <JournalPage
                date={rightDate}
                diaries={diaries}
                side="right"
                onCornerNext={goNext}
                onEdit={() => openEditor(rightDate)}
              />
            </div>
          ) : (
            <JournalPage
              date={focusDate}
              diaries={diaries}
              side="single"
              onCornerNext={goNext}
              onEdit={() => openEditor(focusDate)}
            />
          )}

          {isWide && (
            <JournalNavArrow
              direction="next"
              onClick={goNext}
              label="次のページ"
            />
          )}
        </div>

        {!isWide && (
          <JournalDotIndicator dates={dotDates} focusDate={focusDate} />
        )}
      </div>

      <button
        type="button"
        onClick={() => openEditor(focusDate)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#8a7058] text-[28px] font-light leading-none text-white shadow-[0_4px_20px_rgba(80,60,40,0.35)] transition-transform hover:scale-105 active:scale-95 lg:bottom-8"
        aria-label="新しい日記を書く"
      >
        +
      </button>

      {editorDate && (
        <JournalEditorSheet
          date={editorDate}
          diaries={diaries}
          onSave={onSave}
          onClose={() => setEditorDate(null)}
        />
      )}
    </div>
  );
}
