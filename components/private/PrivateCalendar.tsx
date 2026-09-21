"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppEvent, AppTask } from "@/lib/gyokan/types";
import { groupEventsByDate, truncateEventTitle } from "@/lib/gyokan/events";
import { makeCubicBezierEasing } from "@/lib/gyokan/easing";
import { DayEventsModal } from "./DayEventsModal";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";

function sortTasksByOrder(tasks: AppTask[]): AppTask[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
}

function groupTasksByDate(tasks: AppTask[]): Map<string, AppTask[]> {
  const map = new Map<string, AppTask[]>();
  for (const task of sortTasksByOrder(tasks)) {
    const list = map.get(task.date) ?? [];
    list.push(task);
    map.set(task.date, list);
  }
  return map;
}

type DayChip = { kind: "task"; task: AppTask } | { kind: "event"; event: AppEvent };

type CalendarCell = { day: number; inMonth: boolean };
type MonthCursor = { year: number; month: number };

// Private mode always shows 6 rows (unlike the tasks calendar, which varies
// 4-6 rows by month) so a short month's leftover rows show next month's
// dates grayed out, and the grid height never changes between months.
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
  while (cells.length < 42) {
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

function shiftCursor(cursor: MonthCursor, delta: number): MonthCursor {
  const d = new Date(cursor.year, cursor.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

// Release-animation tuning for the month swipe: a real ease-out deceleration
// curve (not native scroll's browser-controlled easing) so the commit and
// the bounce-back both settle over the same, exact duration.
const MONTH_SNAP_EASING = makeCubicBezierEasing(0.22, 1, 0.36, 1);
const MONTH_SNAP_DURATION_MS = 300;
// Below this fraction of the calendar's width, a swipe bounces back to the
// current month instead of committing to the next/previous one.
const SWIPE_COMMIT_RATIO = 0.3;

const CHIP_PREVIEW_MAX = 4;

function DayCell({
  cell,
  cellIndex,
  year,
  month,
  dayTasks,
  dayEvents,
  onSelect,
}: {
  cell: CalendarCell;
  cellIndex: number;
  year: number;
  month: number;
  dayTasks: AppTask[];
  dayEvents: AppEvent[];
  onSelect: (iso: string) => void;
}) {
  const cellIso = getGridCellIso(year, month, cellIndex);
  const isToday = cellIso === todayISO();
  const dayOfWeek = cellIndex % 7;

  const chips: DayChip[] = [
    ...dayTasks.map((task): DayChip => ({ kind: "task", task })),
    ...dayEvents.map((event): DayChip => ({ kind: "event", event })),
  ];
  const preview = chips.slice(0, CHIP_PREVIEW_MAX);
  const overflow = chips.length > CHIP_PREVIEW_MAX ? chips.length - CHIP_PREVIEW_MAX : 0;

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
        {preview.map((chip) =>
          chip.kind === "task" ? (
            <span
              key={`t-${chip.task.id}`}
              className="truncate rounded-full bg-blue-50 px-1.5 py-px text-[9px] font-medium leading-[13px] text-blue-700"
              title={chip.task.title}
            >
              {truncateEventTitle(chip.task.title)}
            </span>
          ) : (
            <span
              key={`e-${chip.event.id}`}
              className="truncate rounded-[3px] bg-emerald-50 px-1 py-px text-[9px] font-medium leading-[13px] text-emerald-700"
              title={chip.event.title}
            >
              {truncateEventTitle(chip.event.title)}
            </span>
          ),
        )}
      </div>
    </button>
  );
}

function MonthPanel({
  year,
  month,
  tasksByDate,
  eventsByDate,
  onSelect,
}: {
  year: number;
  month: number;
  tasksByDate: Map<string, AppTask[]>;
  eventsByDate: Map<string, AppEvent[]>;
  onSelect: (iso: string) => void;
}) {
  const grid = useMemo(() => getCalendarGrid(year, month), [year, month]);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="relative shrink-0 px-3 py-1 sm:px-4">
        <span className="text-[15px] font-semibold text-gray-900">
          {year}年{month + 1}月
        </span>
        <span className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 select-none text-[4.5rem] font-bold leading-none text-gray-100">
          {month + 1}
        </span>
      </div>

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

      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: "repeat(6, 1fr)" }}>
        {grid.map((cell, i) => (
          <DayCell
            key={i}
            cell={cell}
            cellIndex={i}
            year={year}
            month={month}
            dayTasks={tasksByDate.get(getGridCellIso(year, month, i)) ?? []}
            dayEvents={eventsByDate.get(getGridCellIso(year, month, i)) ?? []}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function PrivateCalendar({
  events,
  tasks,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onReplaceEvents,
  onToggleTask,
  onReplaceTasks,
}: {
  events: AppEvent[];
  tasks: AppTask[];
  onAddEvent: (data: { title: string; startTime: string; endTime?: string | null; memo?: string }) => void;
  onUpdateEvent: (
    id: string,
    patch: { title: string; startTime: string; endTime?: string | null; memo?: string },
  ) => Promise<boolean>;
  onDeleteEvent: (id: string) => void;
  onReplaceEvents: (updater: (prev: AppEvent[]) => AppEvent[]) => void;
  onToggleTask: (id: string) => void;
  onReplaceTasks: (updater: (prev: AppTask[]) => AppTask[]) => void;
}) {
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const tasksByDate = useMemo(() => groupTasksByDate(tasks), [tasks]);
  // Three panels — previous / current / next — form the swipeable track.
  const panels = useMemo(
    () => [shiftCursor(cursor, -1), cursor, shiftCursor(cursor, 1)],
    [cursor],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);

  const getWidth = useCallback(() => containerRef.current?.clientWidth || 0, []);

  const resetTransformInstant = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = "none";
    track.style.transform = `translateX(${-getWidth()}px)`;
  }, [getWidth]);

  // Re-center on the (possibly new) current month whenever it changes —
  // runs before paint, so the swap from the animation's end position to
  // this resting position is never visible.
  useLayoutEffect(() => {
    resetTransformInstant();
  }, [cursor, resetTransformInstant]);

  useLayoutEffect(() => {
    window.addEventListener("resize", resetTransformInstant);
    return () => window.removeEventListener("resize", resetTransformInstant);
  }, [resetTransformInstant]);

  const animateTrackTo = useCallback(
    (fromPx: number, targetPx: number, onDone: (() => void) | null) => {
      cancelAnimRef.current?.();
      cancelAnimRef.current = null;
      const track = trackRef.current;
      if (!track) {
        onDone?.();
        return;
      }
      const delta = targetPx - fromPx;
      if (Math.abs(delta) < 0.5) {
        track.style.transition = "none";
        track.style.transform = `translateX(${targetPx}px)`;
        onDone?.();
        return;
      }
      const startTime = performance.now();
      let cancelled = false;
      const step = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - startTime) / MONTH_SNAP_DURATION_MS);
        track.style.transform = `translateX(${fromPx + delta * MONTH_SNAP_EASING(progress)}px)`;
        if (progress < 1) {
          requestAnimationFrame(step);
        } else {
          cancelAnimRef.current = null;
          onDone?.();
        }
      };
      track.style.transition = "none";
      cancelAnimRef.current = () => {
        cancelled = true;
      };
      requestAnimationFrame(step);
    },
    [],
  );

  const goToMonth = useCallback(
    (dir: 1 | -1) => {
      const w = getWidth();
      animateTrackTo(-w, dir === 1 ? -2 * w : 0, () => {
        setCursor((prev) => shiftCursor(prev, dir));
      });
    },
    [getWidth, animateTrackTo],
  );

  const goToToday = useCallback(() => {
    cancelAnimRef.current?.();
    cancelAnimRef.current = null;
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  }, []);

  // Swipe: real-time 1:1 finger-follow via a directly-mutated transform (no
  // native scrolling involved), then an eased release into place. Confirmed
  // horizontal drags call preventDefault so a diagonal swipe never turns
  // into a vertical page scroll.
  useLayoutEffect(() => {
    const container = containerRef.current;
    const track = trackRef.current;
    if (!container || !track) return;

    let startX = 0;
    let startY = 0;
    let dragging = false;
    let confirmed = false;
    let currentDx = 0;

    const onTouchStart = (e: TouchEvent) => {
      cancelAnimRef.current?.();
      cancelAnimRef.current = null;
      startX = e.touches[0]?.clientX ?? 0;
      startY = e.touches[0]?.clientY ?? 0;
      dragging = true;
      confirmed = false;
      currentDx = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      const x = e.touches[0]?.clientX ?? 0;
      const y = e.touches[0]?.clientY ?? 0;
      const dx = x - startX;
      const dy = y - startY;

      if (!confirmed) {
        if (Math.abs(dx) <= 2 && Math.abs(dy) <= 2) return;
        if (Math.abs(dx) < Math.abs(dy)) {
          // Vertical intent — not ours; let the page handle it normally.
          dragging = false;
          return;
        }
        confirmed = true;
        suppressClickRef.current = true;
      }

      currentDx = dx;
      e.preventDefault();
      track.style.transition = "none";
      track.style.transform = `translateX(${-getWidth() + dx}px)`;
    };

    const onTouchEnd = () => {
      if (!dragging) return;
      dragging = false;
      if (!confirmed) return;

      const w = getWidth();
      const threshold = Math.max(40, w * SWIPE_COMMIT_RATIO);
      const fromPx = -w + currentDx;

      if (Math.abs(currentDx) >= threshold) {
        const dir: 1 | -1 = currentDx < 0 ? 1 : -1;
        animateTrackTo(fromPx, dir === 1 ? -2 * w : 0, () => {
          setCursor((prev) => shiftCursor(prev, dir));
        });
      } else {
        animateTrackTo(fromPx, -w, null);
      }

      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, MONTH_SNAP_DURATION_MS + 50);
    };

    container.addEventListener("touchstart", onTouchStart, { passive: true });
    container.addEventListener("touchmove", onTouchMove, { passive: false });
    container.addEventListener("touchend", onTouchEnd, { passive: true });
    container.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove", onTouchMove);
      container.removeEventListener("touchend", onTouchEnd);
      container.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [getWidth, animateTrackTo]);

  const handleDaySelect = useCallback((iso: string) => {
    if (suppressClickRef.current) return;
    setSelectedDate(iso);
  }, []);

  const selectedDayEvents = selectedDate ? eventsByDate.get(selectedDate) ?? [] : [];
  const selectedDayTasks = selectedDate ? tasksByDate.get(selectedDate) ?? [] : [];
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
        <button
          type="button"
          onClick={goToToday}
          className="rounded-lg border border-black/[0.08] px-2.5 py-1 text-[11px] font-medium text-gray-600 hover:bg-black/[0.03]"
        >
          今日
        </button>
      </div>

      <div
        ref={containerRef}
        className="relative min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: "pan-x", overscrollBehavior: "contain" }}
      >
        <div ref={trackRef} className="flex h-full" style={{ width: "300%" }}>
          {panels.map((p, i) => (
            <div key={i} className="h-full shrink-0" style={{ width: `${100 / 3}%` }}>
              <MonthPanel
                year={p.year}
                month={p.month}
                tasksByDate={tasksByDate}
                eventsByDate={eventsByDate}
                onSelect={handleDaySelect}
              />
            </div>
          ))}
        </div>
      </div>

      {selectedDate && (
        <DayEventsModal
          dateISO={selectedDate}
          dateLabel={selectedDateLabel}
          dayEvents={selectedDayEvents}
          dayTasks={selectedDayTasks}
          taskSectionLabel="タスク"
          onToggleTask={onToggleTask}
          onReplaceTasks={onReplaceTasks}
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
