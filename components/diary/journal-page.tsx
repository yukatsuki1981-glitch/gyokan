"use client";

import {
  useEffect,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const activeIndexRef = useRef(activeIndex);
  const datesLengthRef = useRef(dates.length);
  const onIndexChangeRef = useRef(onIndexChange);

  useEffect(() => { activeIndexRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { datesLengthRef.current = dates.length; }, [dates.length]);
  useEffect(() => { onIndexChangeRef.current = onIndexChange; }, [onIndexChange]);

  // Sync track position when activeIndex changes externally
  useEffect(() => {
    const track = trackRef.current;
    if (!track || dates.length === 0) return;
    const pct = 100 / dates.length;
    track.style.transform = `translateX(-${activeIndex * pct}%)`;
    track.style.transition = "transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";
  }, [activeIndex, dates.length]);

  // Touch handling: detect intent first, then handle h/v independently
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let startX = 0;
    let startY = 0;
    let intent: "h" | "v" | null = null;
    let liveDx = 0;

    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      intent = null;
      liveDx = 0;
      if (trackRef.current) trackRef.current.style.transition = "none";
    };

    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (intent === null) {
        const adx = Math.abs(dx);
        const ady = Math.abs(dy);
        if (adx + ady < 3) return;
        intent = adx >= ady ? "h" : "v";
      }
      if (intent === "h") {
        e.preventDefault();
        liveDx = dx;
        const len = datesLengthRef.current;
        if (!len || !trackRef.current) return;
        const pct = 100 / len;
        trackRef.current.style.transform =
          `translateX(calc(-${activeIndexRef.current * pct}% + ${dx}px))`;
      }
    };

    const snap = (newIdx: number) => {
      const len = datesLengthRef.current;
      if (!len || !trackRef.current) return;
      const pct = 100 / len;
      trackRef.current.style.transform = `translateX(-${newIdx * pct}%)`;
      trackRef.current.style.transition = "transform 280ms cubic-bezier(0.25, 0.46, 0.45, 0.94)";
    };

    const onTouchEnd = () => {
      if (intent === "h") {
        const threshold = container.clientWidth * 0.25;
        const curIdx = activeIndexRef.current;
        const len = datesLengthRef.current;
        let newIdx = curIdx;
        if (liveDx < -threshold && curIdx < len - 1) newIdx = curIdx + 1;
        else if (liveDx > threshold && curIdx > 0) newIdx = curIdx - 1;
        snap(newIdx);
        if (newIdx !== curIdx) onIndexChangeRef.current(newIdx);
      } else {
        snap(activeIndexRef.current);
      }
      intent = null;
      liveDx = 0;
    };

    const onTouchCancel = () => {
      snap(activeIndexRef.current);
      intent = null;
      liveDx = 0;
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd);
    container.addEventListener("touchcancel", onTouchCancel);
    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchCancel);
    };
  }, []);

  const pct = dates.length > 0 ? 100 / dates.length : 100;

  return (
    <div ref={containerRef} className="journal-mobile-pager">
      <div
        ref={trackRef}
        className="flex"
        style={{
          width: `${dates.length * 100}%`,
          transform: `translateX(-${activeIndex * pct}%)`,
          willChange: "transform",
        }}
      >
        {dates.map((date, index) => (
          <div
            key={date}
            className="journal-mobile-pager-slide"
            style={{ width: `${pct}%` }}
          >
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
