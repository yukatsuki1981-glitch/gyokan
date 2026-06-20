"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  formatDateShortJa,
} from "@/lib/gyokan/iso-date";
import {
  getDiaryEntryForDate,
  isJournalEntryEmpty,
  type JournalEntry,
} from "@/lib/gyokan/journal-entry";
import type { AppDailyDiary } from "@/lib/gyokan/types";
import "./diary-journal.css";

type PageSide = "single" | "left" | "right";

export function JournalSpread({ children }: { children: React.ReactNode }) {
  return (
    <div className="journal-spread min-h-0 flex-1">
      <div className="journal-spread-scroll">{children}</div>
    </div>
  );
}

function JournalPageDateHeader({
  date,
  weather,
}: {
  date: string;
  weather?: string;
}) {
  return (
    <header className="journal-page-date-header">
      <time dateTime={date} className="journal-page-date">
        {formatDateShortJa(date)}
        {weather && (
          <span className="journal-page-date-weather" aria-label="天気">
            {weather}
          </span>
        )}
      </time>
      <div className="journal-page-date-rule" aria-hidden />
    </header>
  );
}

export function JournalPage({
  date,
  diaries,
  side,
  inSpread = false,
  onCornerNext,
  onEdit,
}: {
  date: string;
  diaries: AppDailyDiary[];
  side: PageSide;
  inSpread?: boolean;
  onCornerNext?: () => void;
  onEdit?: () => void;
}) {
  const entry = getDiaryEntryForDate(diaries, date);
  const empty = isJournalEntryEmpty(entry);
  const rounded =
    side === "left"
      ? "rounded-l-sm rounded-r-none"
      : side === "right"
        ? "rounded-r-sm rounded-l-none"
        : "rounded-sm";

  const paperClass = inSpread
    ? `journal-paper--in-spread journal-paper--${side}`
    : side === "single"
      ? "journal-paper--single min-h-[min(72vh,640px)]"
      : `journal-paper--${side} min-h-[min(72vh,640px)]`;

  return (
    <article
      className={`journal-paper relative flex flex-1 flex-col overflow-hidden ${paperClass} ${rounded}`}
      onClick={empty ? onEdit : undefined}
      role={empty && onEdit ? "button" : undefined}
      tabIndex={empty && onEdit ? 0 : undefined}
      onKeyDown={
        empty && onEdit
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onEdit();
              }
            }
          : undefined
      }
    >
      <JournalPageDateHeader date={date} weather={empty ? undefined : entry.weather} />
      <div className="journal-margin-line" aria-hidden />

      <div
        className={`journal-paper-lines relative z-[1] flex-1 ${inSpread ? "" : "min-h-0 overflow-y-auto"}`}
      >
        <div className="journal-lined-content">
          {!empty && (entry.moodEmoji || entry.moodLabel) && (
            <MoodLine entry={entry} />
          )}
          {empty ? (
            <p className="journal-body-text text-[#a89880]">まだ日記がありません</p>
          ) : (
            <>
              {entry.text.trim() ? (
                <p className="journal-body-text">{entry.text}</p>
              ) : null}
              {entry.photos.length > 0 && (
                <JournalPhotoStrip photos={entry.photos} />
              )}
              <div className="h-[var(--journal-line-h)]" aria-hidden title="スタンプ用の余白" />
            </>
          )}
        </div>
      </div>

      {!empty && onEdit && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="absolute right-3 top-3 z-[2] rounded-full bg-white/60 px-2.5 py-1 text-[11px] text-[#7a6a58] backdrop-blur-sm transition-colors hover:bg-white/90"
        >
          編集
        </button>
      )}

      {onCornerNext && (
        <button
          type="button"
          className="journal-page-fold z-[2]"
          onClick={(e) => {
            e.stopPropagation();
            onCornerNext();
          }}
          aria-label="次の日へ"
        />
      )}
    </article>
  );
}

function MoodLine({ entry }: { entry: JournalEntry }) {
  return (
    <p className="journal-body-text text-[#5a5048]">
      {entry.moodEmoji && <span>{entry.moodEmoji} </span>}
      {entry.moodLabel}
    </p>
  );
}

function JournalPhotoStrip({ photos }: { photos: JournalEntry["photos"] }) {
  return (
    <div className="mt-4 flex flex-wrap gap-3 pb-2">
      {photos.map((photo, i) => (
        <figure
          key={photo.id}
          className="journal-photo-polaroid shrink-0"
          style={{
            transform: `rotate(${photo.rotation || (i % 2 === 0 ? -3 : 4)}deg)`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo.dataUrl}
            alt=""
            className="block h-24 w-24 object-cover sm:h-28 sm:w-28"
          />
        </figure>
      ))}
    </div>
  );
}

export function JournalSpine() {
  return <div className="journal-spine self-stretch" aria-hidden />;
}

export function JournalNavArrow({
  direction,
  onClick,
  disabled,
  label,
}: {
  direction: "prev" | "next";
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-12 w-10 shrink-0 items-center justify-center rounded-full text-[#8a7a68] transition-all hover:bg-black/[0.04] hover:text-[#5a4a38] disabled:pointer-events-none disabled:opacity-25"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="h-6 w-6"
      >
        {direction === "prev" ? (
          <path d="M15 6l-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}

export function JournalMobilePager({
  dates,
  activeIndex,
  onIndexChange,
  diaries,
  onEdit,
}: {
  dates: string[];
  activeIndex: number;
  onIndexChange: (index: number) => void;
  diaries: AppDailyDiary[];
  onEdit: (date: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const programmaticScrollRef = useRef(false);

  const scrollToIndex = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0) return;
    programmaticScrollRef.current = true;
    el.scrollTo({ left: index * el.clientWidth, behavior });
    window.setTimeout(() => {
      programmaticScrollRef.current = false;
    }, behavior === "smooth" ? 400 : 0);
  }, []);

  const syncIndexFromScroll = useCallback(() => {
    if (programmaticScrollRef.current) return;
    const el = scrollRef.current;
    if (!el || el.clientWidth <= 0) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    const clamped = Math.max(0, Math.min(dates.length - 1, idx));
    if (clamped !== activeIndex) {
      onIndexChange(clamped);
    }
  }, [activeIndex, dates.length, onIndexChange]);

  useLayoutEffect(() => {
    scrollToIndex(activeIndex, "auto");
  }, [activeIndex, scrollToIndex]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        syncIndexFromScroll();
      });
    };

    const onScrollEnd = () => {
      syncIndexFromScroll();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("scrollend", onScrollEnd);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("scrollend", onScrollEnd);
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, [syncIndexFromScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      scrollToIndex(activeIndex, "auto");
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeIndex, scrollToIndex]);

  return (
    <div ref={scrollRef} className="journal-mobile-pager scrollbar-none">
      {dates.map((date, index) => (
        <div key={date} className="journal-mobile-pager-slide">
          <JournalPage
            date={date}
            diaries={diaries}
            side="single"
            onCornerNext={index < dates.length - 1 ? () => onIndexChange(index + 1) : undefined}
            onEdit={() => onEdit(date)}
          />
        </div>
      ))}
    </div>
  );
}

export function JournalMobileDateNav({
  onPrev,
  onNext,
  canGoPrev = true,
  canGoNext = true,
}: {
  onPrev: () => void;
  onNext: () => void;
  canGoPrev?: boolean;
  canGoNext?: boolean;
}) {
  return (
    <div className="mb-3 flex items-center justify-center gap-10">
      <button
        type="button"
        onClick={onPrev}
        disabled={!canGoPrev}
        className="rounded-lg px-3 py-1 text-[22px] text-[#8a7a68] hover:bg-black/[0.04] disabled:pointer-events-none disabled:opacity-25"
        aria-label="前の日記"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext}
        className="rounded-lg px-3 py-1 text-[22px] text-[#8a7a68] hover:bg-black/[0.04] disabled:pointer-events-none disabled:opacity-25"
        aria-label="次の日記"
      >
        ›
      </button>
    </div>
  );
}

export function JournalDotIndicator({
  dates,
  focusDate,
}: {
  dates: string[];
  focusDate: string;
}) {
  const idx = dates.indexOf(focusDate);
  if (dates.length <= 1) return null;
  const windowStart = Math.max(0, Math.min(idx - 1, dates.length - 3));
  const visible = dates.slice(windowStart, windowStart + 3);

  return (
    <div className="mt-4 flex justify-center gap-2">
      {visible.map((d) => (
        <span
          key={d}
          className={`h-2 w-2 rounded-full transition-colors ${
            d === focusDate ? "bg-[#a08060]" : "bg-[#d4c8b8]"
          }`}
          aria-hidden
        />
      ))}
    </div>
  );
}
