"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatDateJa } from "@/lib/gyokan/iso-date";
import { fileToJournalPhoto } from "@/lib/gyokan/image-resize";
import {
  getDiaryEntryForDate,
  isJournalEntryEmpty,
  MOOD_PRESETS,
  serializeJournalEntry,
  WEATHER_OPTIONS,
  type JournalEntry,
} from "@/lib/gyokan/journal-entry";
import type { AppDailyDiary } from "@/lib/gyokan/types";
import "./diary-journal.css";

export function JournalEditorSheet({
  date,
  diaries,
  onSave,
  onClose,
}: {
  date: string;
  diaries: AppDailyDiary[];
  onSave: (date: string, entry: JournalEntry) => Promise<boolean>;
  onClose: () => void;
}) {
  const serverEntry = getDiaryEntryForDate(diaries, date);
  const [entry, setEntry] = useState<JournalEntry>(serverEntry);
  const [saving, setSaving] = useState(false);
  const baselineRef = useRef(serializeJournalEntry(serverEntry));
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const next = getDiaryEntryForDate(diaries, date);
    setEntry(next);
    baselineRef.current = serializeJournalEntry(next);
  }, [date, diaries]);

  const flush = useCallback(async () => {
    const serialized = serializeJournalEntry(entry);
    if (serialized === baselineRef.current) return;
    setSaving(true);
    const ok = await onSave(date, entry);
    if (ok) baselineRef.current = serialized;
    setSaving(false);
  }, [date, entry, onSave]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void flush();
    }, 500);
    return () => clearTimeout(timer);
  }, [entry, flush]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    return () => {
      void flush();
    };
  }, [flush]);

  const handlePhotos = async (files: FileList | null) => {
    if (!files?.length) return;
    const added = await Promise.all(
      Array.from(files).map((f, i) => fileToJournalPhoto(f, entry.photos.length + i)),
    );
    setEntry((prev) => ({ ...prev, photos: [...prev.photos, ...added] }));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="日記を書く"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        aria-label="閉じる"
        onClick={() => {
          void flush().then(onClose);
        }}
      />
      <div
        className="relative flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-[#faf6ef] shadow-2xl sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3">
          <div>
            <h2 className="journal-body-text journal-date-row text-[16px]">
              {formatDateJa(date)}
            </h2>
            {saving && (
              <p className="text-[11px] text-[#a09080]">保存中…</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void flush().then(onClose)}
            className="rounded-xl p-2 text-[#8a7a68] hover:bg-black/[0.04]"
            aria-label="閉じる"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <div className="mb-4">
            <span className="mb-1.5 block text-[11px] font-medium text-[#9a8a78]">天気</span>
            <div className="flex flex-wrap gap-1.5">
              {WEATHER_OPTIONS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() =>
                    setEntry((prev) => ({
                      ...prev,
                      weather: prev.weather === w ? undefined : w,
                    }))
                  }
                  className={`rounded-lg px-2.5 py-1.5 text-[18px] transition-all ${
                    entry.weather === w
                      ? "bg-white ring-2 ring-[#c4a882]"
                      : "bg-white/50 hover:bg-white/80"
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <span className="mb-1.5 block text-[11px] font-medium text-[#9a8a78]">気分</span>
            <div className="flex flex-wrap gap-1.5">
              {MOOD_PRESETS.map((m) => {
                const active =
                  entry.moodEmoji === m.emoji && entry.moodLabel === m.label;
                return (
                  <button
                    key={m.label}
                    type="button"
                    onClick={() =>
                      setEntry((prev) =>
                        active
                          ? { ...prev, moodEmoji: undefined, moodLabel: undefined }
                          : {
                              ...prev,
                              moodEmoji: m.emoji,
                              moodLabel: m.label,
                            },
                      )
                    }
                    className="journal-body-text rounded-full px-2.5 py-1 text-[12px] transition-all"
                    style={{
                      background: active ? m.color : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {m.emoji} {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mb-4">
            <span className="mb-1.5 block text-[11px] font-medium text-[#9a8a78]">本文</span>
            <textarea
              value={entry.text}
              onChange={(e) => setEntry((prev) => ({ ...prev, text: e.target.value }))}
              rows={8}
              placeholder="今日のことを書いてみましょう…"
              className="journal-body-text w-full resize-none rounded-xl border border-black/[0.06] bg-white/70 px-3 py-2.5 outline-none focus:border-[#c4a882] focus:ring-2 focus:ring-[#e8dcc8]"
              style={{ lineHeight: "28px" }}
            />
          </div>

          <div className="mb-2">
            <span className="mb-1.5 block text-[11px] font-medium text-[#9a8a78]">写真</span>
            <div className="flex flex-wrap gap-2">
              {entry.photos.map((photo) => (
                <figure
                  key={photo.id}
                  className="journal-photo-polaroid relative"
                  style={{ transform: `rotate(${photo.rotation}deg)` }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.dataUrl}
                    alt=""
                    className="block h-20 w-20 object-cover"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEntry((prev) => ({
                        ...prev,
                        photos: prev.photos.filter((p) => p.id !== photo.id),
                      }))
                    }
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#5a4a38] text-[10px] text-white"
                    aria-label="写真を削除"
                  >
                    ×
                  </button>
                </figure>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex h-20 w-20 items-center justify-center rounded-lg border border-dashed border-[#c4b4a0] bg-white/40 text-[24px] text-[#b0a090] hover:bg-white/70"
                aria-label="写真を追加"
              >
                +
              </button>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handlePhotos(e.target.files)}
            />
            <p className="mt-2 text-[10px] text-[#b0a090]">
              スタンプは今後追加予定です
            </p>
          </div>
        </div>

        <footer className="shrink-0 border-t border-black/[0.06] px-4 py-3">
          <button
            type="button"
            onClick={() => void flush().then(onClose)}
            className="w-full rounded-xl bg-[#8a7058] py-2.5 text-[14px] font-medium text-white transition-colors hover:bg-[#7a6048]"
          >
            {isJournalEntryEmpty(entry) ? "下書きを閉じる" : "保存して閉じる"}
          </button>
        </footer>
      </div>
    </div>
  );
}
