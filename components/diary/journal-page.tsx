"use client";

import {
  formatDateJa,
  formatDateShortJa,
  weekdayJa,
} from "@/lib/gyokan/iso-date";
import {
  getDiaryEntryForDate,
  isJournalEntryEmpty,
  type JournalEntry,
} from "@/lib/gyokan/journal-entry";
import type { AppDailyDiary } from "@/lib/gyokan/types";
import "./diary-journal.css";

type PageSide = "single" | "left" | "right";

export function JournalPage({
  date,
  diaries,
  side,
  onCornerNext,
  onEdit,
}: {
  date: string;
  diaries: AppDailyDiary[];
  side: PageSide;
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

  return (
    <article
      className={`journal-paper journal-paper-lines relative flex min-h-[min(72vh,640px)] flex-1 flex-col overflow-hidden ${rounded}`}
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
      <div className="journal-margin-line" aria-hidden />
      <div className="journal-ring-holes" aria-hidden>
        {Array.from({ length: 8 }).map((_, i) => (
          <span key={i} className="journal-ring-hole" />
        ))}
      </div>

      <header className="relative z-[1] shrink-0 px-5 pb-2 pt-5 pl-[var(--journal-margin-left)]">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <time
            dateTime={date}
            className="text-[15px] font-semibold tracking-tight text-[#4a3f32]"
            style={{ fontFamily: "var(--font-shippori-mincho), serif" }}
          >
            {side === "single" ? formatDateShortJa(date) : formatDateJa(date)}
          </time>
          {entry.weather && (
            <span className="text-[18px]" aria-label="天気">
              {entry.weather}
            </span>
          )}
        </div>
        {entry.moodEmoji || entry.moodLabel ? (
          <MoodBadge entry={entry} />
        ) : null}
      </header>

      <div className="relative z-[1] min-h-0 flex-1 overflow-y-auto px-5 pb-16 pl-[var(--journal-margin-left)]">
        {empty ? (
          <p className="journal-body-text pt-[var(--journal-line-h)] text-[#a89880]">
            まだ日記がありません
          </p>
        ) : (
          <>
            {entry.text.trim() ? (
              <p className="journal-body-text pt-1">{entry.text}</p>
            ) : null}
            {entry.photos.length > 0 && (
              <JournalPhotoStrip photos={entry.photos} />
            )}
            <div className="mt-6 h-10" aria-hidden title="スタンプ用の余白" />
          </>
        )}
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

function MoodBadge({ entry }: { entry: JournalEntry }) {
  return (
    <span
      className="mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[12px] text-[#5a5048]"
      style={{
        background: "rgba(232, 220, 200, 0.55)",
        fontFamily: "var(--font-zen-maru-gothic), sans-serif",
      }}
    >
      {entry.moodEmoji && <span>{entry.moodEmoji}</span>}
      {entry.moodLabel && <span>{entry.moodLabel}</span>}
    </span>
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

export function JournalMobileDateNav({
  date,
  onPrev,
  onNext,
}: {
  date: string;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="mb-3 flex items-center justify-center gap-4">
      <button
        type="button"
        onClick={onPrev}
        className="rounded-lg px-2 py-1 text-[20px] text-[#8a7a68] hover:bg-black/[0.04]"
        aria-label="前の日"
      >
        ‹
      </button>
      <span
        className="min-w-[10rem] text-center text-[15px] font-medium text-[#4a3f32]"
        style={{ fontFamily: "var(--font-shippori-mincho), serif" }}
      >
        {formatDateShortJa(date)}
        <span className="ml-1 text-[13px] text-[#9a8a78]">({weekdayJa(date)})</span>
      </span>
      <button
        type="button"
        onClick={onNext}
        className="rounded-lg px-2 py-1 text-[20px] text-[#8a7a68] hover:bg-black/[0.04]"
        aria-label="次の日"
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
