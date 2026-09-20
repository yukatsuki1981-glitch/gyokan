"use client";

import { useMemo, useRef, useState, type TouchEvent } from "react";
import type { AppEvent } from "@/lib/gyokan/types";
import { groupEventsByDate, truncateEventTitle } from "@/lib/gyokan/events";
import { DayEventsModal } from "./DayEventsModal";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

type CalendarCell = { day: number; inMonth: boolean };

function getCalendarGrid(year: number, month: number): CalendarCell[] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: CalendarCell[] = [];

  const prevLast = new Date(year, month, 0).getDate();
  for (let i = first.getDay() - 1; i >= 0; i--) {
    cells.push({ day: prevLast - i, inMonth: false });
  }
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push({ day: d, inMonth: true });
  }
  let next = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ day: next++, inMonth: false });
  }
  return cells;
}

function getGridCellIso(year: number, month: number, cellIndex: number) {
  const startDow = new Date(year, month, 1).getDay();
  const d = new Date(year, month, 1 - startDow + cellIndex);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const EVENT_PREVIEW_MAX = 4;

function DayCell({
  cell,
  cellIndex,
  year,
  month,
  dayEvents,
  onSelect,
}: {
  cell: CalendarCell;
  cellIndex: number;
  year: number;
  month: number;
  dayEvents: AppEvent[];
  onSelect: (iso: string) => void;
}) {
  const cellIso = getGridCellIso(year, month, cellIndex);
  const isToday = cellIso === todayISO();
  const dayOfWeek = cellIndex % 7;
  const preview = dayEvents.slice(0, EVENT_PREVIEW_MAX);
  const overflow = dayEvents.length > EVENT_PREVIEW_MAX ? dayEvents.length - EVENT_PREVIEW_MAX : 0;

  const numberColor = !cell.inMonth
    ? "text-gray-300"
    : dayOfWeek === 0
      ? "text-red-500"
      : dayOfWeek === 6
        ? "text-blue-500"
        : "text-gray-700";

  return (
    <button
      type="button"
      onClick={() => onSelect(cellIso)}
      className={`flex min-h-0 flex-col items-stretch overflow-hidden border-b border-r border-black/[0.05] p-1 text-left transition-colors hover:bg-black/[0.02] ${
        cell.inMonth ? "bg-white" : "bg-gray-50/60"
      }`}
    >
      <div className="flex shrink-0 items-center gap-1">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold leading-none ${
            isToday ? "bg-[#007AFF] text-white" : numberColor
          }`}
        >
          {cell.day}
        </span>
        {overflow > 0 && (
          <span className="text-[10px] font-medium text-gray-400">+{overflow}</span>
        )}
      </div>
      <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        {preview.map((event) => (
          <span
            key={event.id}
            className="truncate rounded-[3px] bg-indigo-50 px-1 py-px text-[9px] font-medium leading-[13px] text-indigo-700"
            title={event.title}
          >
            {truncateEventTitle(event.title)}
          </span>
        ))}
      </div>
    </button>
  );
}

export function PrivateCalendar({
  events,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onReplaceEvents,
}: {
  events: AppEvent[];
  onAddEvent: (data: { title: string; startTime: string; endTime?: string | null; memo?: string }) => void;
  onUpdateEvent: (
    id: string,
    patch: { title: string; startTime: string; endTime?: string | null; memo?: string },
  ) => Promise<boolean>;
  onDeleteEvent: (id: string) => void;
  onReplaceEvents: (updater: (prev: AppEvent[]) => AppEvent[]) => void;
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const grid = useMemo(() => getCalendarGrid(cursor.year, cursor.month), [cursor]);
  const weekCount = grid.length / 7;

  const goToMonth = (delta: number) => {
    setCursor(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToToday = () => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const SWIPE_THRESHOLD = 48;

  const handleTouchStart = (e: TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchEnd = (e: TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    if (Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goToMonth(dx < 0 ? 1 : -1);
    }
  };

  const selectedDayEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const selectedDateLabel = selectedDate
    ? (() => {
        const [y, m, d] = selectedDate.split("-").map((v) => parseInt(v, 10));
        const date = new Date(y, m - 1, d);
        return `${y}年${m}月${d}日（${WEEKDAY_LABELS[date.getDay()]}）`;
      })()
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => goToMonth(-1)}
            aria-label="前の月"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-black/[0.04]"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => goToMonth(1)}
            aria-label="次の月"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-black/[0.04]"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
        <span className="text-[15px] font-semibold text-gray-900">
          {cursor.year}年{cursor.month + 1}月
        </span>
        <button
          type="button"
          onClick={goToToday}
          className="rounded-lg border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-black/[0.03]"
        >
          今日
        </button>
      </div>

      <div
        className="flex min-h-0 flex-1 flex-col"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="grid shrink-0 grid-cols-7 border-b border-t border-black/[0.06]">
          {WEEKDAY_LABELS.map((label, i) => (
            <div
              key={label}
              className={`py-1 text-center text-[11px] font-medium ${
                i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-gray-500"
              }`}
            >
              {label}
            </div>
          ))}
        </div>

        <div
          className="grid min-h-0 flex-1 grid-cols-7"
          style={{ gridTemplateRows: `repeat(${weekCount}, 1fr)` }}
        >
          {grid.map((cell, i) => (
            <DayCell
              key={i}
              cell={cell}
              cellIndex={i}
              year={cursor.year}
              month={cursor.month}
              dayEvents={eventsByDate.get(getGridCellIso(cursor.year, cursor.month, i)) ?? []}
              onSelect={setSelectedDate}
            />
          ))}
        </div>
      </div>

      {selectedDate && (
        <DayEventsModal
          dateISO={selectedDate}
          dateLabel={selectedDateLabel}
          dayEvents={selectedDayEvents}
          onAddEvent={onAddEvent}
          onUpdateEvent={onUpdateEvent}
          onDeleteEvent={onDeleteEvent}
          onReplaceEvents={onReplaceEvents}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
