"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AppEvent, AppTask } from "@/lib/gyokan/types";
import {
  combineLocalDateAndTime,
  localTimeHHMMFromTimestamp,
  sortEventsByOrder,
} from "@/lib/gyokan/events";
import { makeCubicBezierEasing } from "@/lib/gyokan/easing";
import { ThemedTaskCheckbox } from "@/components/themed-task-checkbox";
import { XIcon } from "./icons";

const SHEET_DISMISS_EASING = makeCubicBezierEasing(0.22, 1, 0.36, 1);
const SHEET_DISMISS_DURATION_MS = 260;

function sortTasksByOrder(tasks: AppTask[]): AppTask[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
}

function timeRangeLabel(event: AppEvent): string {
  const start = localTimeHHMMFromTimestamp(event.startTime);
  if (!event.endTime) return start;
  const end = localTimeHHMMFromTimestamp(event.endTime);
  return `${start} - ${end}`;
}

type View = "list" | "add";

export function DayEventPopup({
  dateISO,
  dateLabel,
  dayEvents,
  dayTasks,
  onToggleTask,
  onAddEvent,
  onClose,
}: {
  dateISO: string;
  dateLabel: string;
  dayEvents: AppEvent[];
  dayTasks: AppTask[];
  onToggleTask: (id: string) => void;
  onAddEvent: (data: { title: string; startTime: string; endTime?: string | null; memo?: string }) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(() => (dayEvents.length === 0 ? "add" : "list"));
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [memo, setMemo] = useState("");

  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartYRef = useRef(0);
  const draggingRef = useRef(false);
  const confirmedRef = useRef(false);
  const cancelAnimRef = useRef<(() => void) | null>(null);

  const animateSheetTo = useCallback(
    (fromPx: number, targetPx: number, onDone: (() => void) | null) => {
      cancelAnimRef.current?.();
      cancelAnimRef.current = null;
      const sheet = sheetRef.current;
      if (!sheet) {
        onDone?.();
        return;
      }
      const delta = targetPx - fromPx;
      if (Math.abs(delta) < 0.5) {
        sheet.style.transition = "none";
        sheet.style.transform = targetPx === 0 ? "" : `translateY(${targetPx}px)`;
        onDone?.();
        return;
      }
      const startTs = performance.now();
      let cancelled = false;
      const step = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - startTs) / SHEET_DISMISS_DURATION_MS);
        sheet.style.transform = `translateY(${fromPx + delta * SHEET_DISMISS_EASING(progress)}px)`;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          cancelAnimRef.current = null;
          onDone?.();
        }
      };
      sheet.style.transition = "none";
      cancelAnimRef.current = () => {
        cancelled = true;
      };
      requestAnimationFrame(step);
    },
    [],
  );

  const handleGripTouchStart = useCallback((e: React.TouchEvent) => {
    cancelAnimRef.current?.();
    cancelAnimRef.current = null;
    dragStartYRef.current = e.touches[0]?.clientY ?? 0;
    draggingRef.current = true;
    confirmedRef.current = false;
  }, []);

  const handleGripTouchMove = useCallback((e: React.TouchEvent) => {
    if (!draggingRef.current) return;
    const y = e.touches[0]?.clientY ?? 0;
    const dy = y - dragStartYRef.current;
    if (dy <= 0) return;
    confirmedRef.current = true;
    const sheet = sheetRef.current;
    if (sheet) {
      sheet.style.transition = "none";
      sheet.style.transform = `translateY(${dy}px)`;
    }
  }, []);

  const handleGripTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      if (!confirmedRef.current) return;
      const sheet = sheetRef.current;
      const sheetHeight = sheet?.getBoundingClientRect().height ?? 0;
      const dy = (e.changedTouches[0]?.clientY ?? 0) - dragStartYRef.current;
      const threshold = Math.max(60, sheetHeight * 0.25);
      if (dy >= threshold) {
        animateSheetTo(dy, sheetHeight + 40, onClose);
      } else {
        animateSheetTo(dy, 0, null);
      }
    },
    [animateSheetTo, onClose],
  );

  useEffect(() => {
    return () => {
      cancelAnimRef.current?.();
    };
  }, []);

  const handleAdd = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    onAddEvent({
      title: trimmed,
      startTime: combineLocalDateAndTime(dateISO, startTime),
      endTime: endTime ? combineLocalDateAndTime(dateISO, endTime) : null,
      memo: memo.trim() || undefined,
    });
    onClose();
  };

  const sortedEvents = sortEventsByOrder(dayEvents);
  const sortedTasks = sortTasksByOrder(dayTasks);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[50vh] w-full flex-col overflow-hidden rounded-t-2xl bg-[#fafafa] shadow-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl"
      >
        <div
          className="flex shrink-0 flex-col items-center pb-1 pt-2 sm:hidden"
          onTouchStart={handleGripTouchStart}
          onTouchMove={handleGripTouchMove}
          onTouchEnd={handleGripTouchEnd}
        >
          <span className="h-1 w-9 rounded-full bg-black/15" />
        </div>

        <div className="flex shrink-0 items-center justify-between border-b border-black/[0.05] px-4 py-3">
          <span className="text-[14px] font-semibold text-gray-900">{dateLabel}</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-black/[0.04]"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {view === "list" ? (
            <>
              <section className="mb-4">
                <p className="mb-1.5 text-[11px] font-medium text-gray-400">予定</p>
                {sortedEvents.length === 0 ? (
                  <p className="text-[12px] text-gray-300">予定はありません</p>
                ) : (
                  <ul className="flex flex-col gap-1.5">
                    {sortedEvents.map((event) => (
                      <li
                        key={event.id}
                        className="flex items-center gap-2 rounded-xl border border-black/[0.04] bg-white px-3 py-2"
                      >
                        <span className="h-[14px] w-[14px] shrink-0 rounded-[4px] border border-emerald-300 bg-emerald-50" />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-gray-800">
                          {event.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400">
                          {timeRangeLabel(event)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {sortedTasks.length > 0 && (
                <section className="mb-4">
                  <p className="mb-1.5 text-[11px] font-medium text-gray-400">タスク</p>
                  <ul className="flex flex-col gap-1.5">
                    {sortedTasks.map((task) => (
                      <li
                        key={task.id}
                        className="flex items-center gap-2 rounded-xl border border-black/[0.04] bg-white px-3 py-2"
                      >
                        <ThemedTaskCheckbox
                          size="sm"
                          done={task.done}
                          onClick={() => onToggleTask(task.id)}
                        />
                        <span
                          className={`min-w-0 flex-1 truncate text-[13px] ${
                            task.done ? "text-gray-300 line-through" : "text-gray-800"
                          }`}
                        >
                          {task.title}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <button
                type="button"
                onClick={() => setView("add")}
                className="w-full rounded-xl border border-dashed border-black/[0.1] py-2.5 text-[13px] font-medium text-[var(--gyokan-accent2)] hover:bg-blue-50"
              >
                ＋ 予定を追加
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-gray-400">タイトル</span>
                <input
                  autoFocus
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="予定のタイトル"
                  className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[14px] text-gray-900 outline-none focus:border-[var(--gyokan-accent2)]"
                />
              </label>
              <div className="flex gap-2">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[11px] font-medium text-gray-400">開始</span>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[14px] text-gray-900 outline-none focus:border-[var(--gyokan-accent2)]"
                  />
                </label>
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-[11px] font-medium text-gray-400">終了（任意）</span>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[14px] text-gray-900 outline-none focus:border-[var(--gyokan-accent2)]"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-gray-400">メモ（任意）</span>
                <textarea
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  rows={3}
                  className="resize-none rounded-xl border border-black/[0.08] bg-white px-3 py-2 text-[13px] text-gray-900 outline-none focus:border-[var(--gyokan-accent2)]"
                />
              </label>
              <div className="flex gap-2 pt-1">
                {sortedEvents.length + sortedTasks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setView("list")}
                    className="rounded-xl border border-black/[0.08] px-4 py-2.5 text-[13px] font-medium text-gray-600 hover:bg-black/[0.03]"
                  >
                    戻る
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleAdd}
                  disabled={!title.trim()}
                  className="flex-1 rounded-xl bg-[var(--gyokan-accent2)] py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
                >
                  保存
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
