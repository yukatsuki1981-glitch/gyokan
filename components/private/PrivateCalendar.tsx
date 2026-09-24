"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { AppEvent, AppTask } from "@/lib/gyokan/types";
import { groupEventsByDate, truncateEventTitle } from "@/lib/gyokan/events";
import { makeCubicBezierEasing } from "@/lib/gyokan/easing";
import { getJapaneseCalendarDay } from "@/lib/gyokan/japanese-calendar-days";
import { DayEventPopup } from "./DayEventPopup";

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
type MonthCursor = { year: number; month: number };
type CalendarCell = { day: number; iso: string; inMonth: boolean };

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const CHIP_PREVIEW_MAX = 4;

// Release-animation tuning for the month swipe — same ease-out deceleration
// curve/duration used elsewhere in this codebase (the day-popup swipe-
// dismiss), picked to land in the 250-350ms range with a real cubic-bezier
// curve. Native scrollTo({behavior:"smooth"}) (what tasks mode's own
// calendar uses) can't guarantee a specific duration/curve across browsers,
// so this is a real-time-drag transform carousel instead — same commit/
// bounce/ease-out feel, precise timing.
const MONTH_SNAP_EASING = makeCubicBezierEasing(0.22, 1, 0.36, 1);
const MONTH_SNAP_DURATION_MS = 300;
const SWIPE_COMMIT_RATIO = 0.3;

function isoOf(year: number, month: number, day: number) {
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${year}-${m}-${d}`;
}

function todayISO() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

function shiftCursor(cursor: MonthCursor, delta: number): MonthCursor {
  const d = new Date(cursor.year, cursor.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// Always exactly 42 cells (6 fixed rows): leading days borrow from the
// previous month, trailing days from the next — both greyed via
// cell.inMonth === false, matching the original private-calendar spec.
function buildGridCells(year: number, month: number): CalendarCell[] {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDow = new Date(year, month, 1).getDay();
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  const cells: CalendarCell[] = [];

  for (let i = firstDow - 1; i >= 0; i--) {
    const day = prevMonthLastDay - i;
    const d = new Date(year, month - 1, day);
    cells.push({ day, iso: isoOf(d.getFullYear(), d.getMonth(), day), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: isoOf(year, month, day), inMonth: true });
  }
  let nextDay = 1;
  while (cells.length < 42) {
    const d = new Date(year, month + 1, nextDay);
    cells.push({ day: nextDay, iso: isoOf(d.getFullYear(), d.getMonth(), nextDay), inMonth: false });
    nextDay++;
  }
  return cells;
}

function DayCell({
  cell,
  cellIndex,
  isToday,
  dayTasks,
  dayEvents,
  onSelect,
}: {
  cell: CalendarCell;
  cellIndex: number;
  isToday: boolean;
  dayTasks: AppTask[];
  dayEvents: AppEvent[];
  onSelect: (iso: string) => void;
}) {
  const dayOfWeek = cellIndex % 7;
  const dayInfo = cell.inMonth ? getJapaneseCalendarDay(cell.iso) : null;

  const chips: DayChip[] = [
    ...dayTasks.map((task): DayChip => ({ kind: "task", task })),
    ...dayEvents.map((event): DayChip => ({ kind: "event", event })),
  ];
  const preview = chips.slice(0, CHIP_PREVIEW_MAX);
  const overflow = chips.length > CHIP_PREVIEW_MAX ? chips.length - CHIP_PREVIEW_MAX : 0;

  const numberColor = !cell.inMonth
    ? "text-gray-300"
    : isToday
      ? ""
      : dayOfWeek === 0
        ? "text-red-500"
        : dayOfWeek === 6
          ? "text-blue-500"
          : "text-gray-700";

  return (
    <button
      type="button"
      onClick={() => onSelect(cell.iso)}
      className={`flex min-h-0 flex-col items-stretch overflow-hidden border-b border-r border-black/[0.05] p-0.5 text-left transition-colors hover:bg-black/[0.02] ${
        cell.inMonth ? "bg-white" : "bg-gray-50/60"
      }`}
    >
      <div className="flex shrink-0 items-center gap-1">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold leading-none ${
            isToday ? "bg-[#007AFF] text-white" : numberColor
          }`}
        >
          {cell.day}
        </span>
        {overflow > 0 && <span className="text-[11px] font-medium text-gray-400">+{overflow}</span>}
      </div>
      {dayInfo && (
        <span
          className={`mt-0.5 shrink-0 truncate px-0.5 text-[9px] leading-[11px] ${
            dayInfo.kind === "holiday" ? "font-medium text-rose-600" : "font-medium text-gray-500"
          }`}
          title={dayInfo.label}
        >
          {dayInfo.label}
        </span>
      )}
      <div className="mt-0.5 flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden">
        {preview.map((chip) =>
          chip.kind === "task" ? (
            <span
              key={`t-${chip.task.id}`}
              className={`truncate rounded-full px-0.5 py-0.5 text-[10px] font-medium leading-[13px] tracking-tight ${
                cell.inMonth ? "bg-blue-50 text-blue-700" : "bg-blue-50/40 text-blue-300"
              }`}
              title={chip.task.title}
            >
              {truncateEventTitle(chip.task.title)}
            </span>
          ) : (
            <span
              key={`e-${chip.event.id}`}
              className={`truncate rounded-[4px] px-0.5 py-0.5 text-[10px] font-medium leading-[13px] tracking-tight ${
                cell.inMonth ? "bg-emerald-50 text-emerald-700" : "bg-emerald-50/40 text-emerald-300"
              }`}
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
  onToday,
}: {
  year: number;
  month: number;
  tasksByDate: Map<string, AppTask[]>;
  eventsByDate: Map<string, AppEvent[]>;
  onSelect: (iso: string) => void;
  onToday: () => void;
}) {
  const cells = useMemo(() => buildGridCells(year, month), [year, month]);
  const today = todayISO();

  return (
    <div className="flex min-h-0 flex-1 min-w-0 flex-col">
      <div className="relative flex shrink-0 items-center justify-between px-3 py-1 sm:px-4">
        <span className="text-[15px] font-semibold text-gray-900">
          {year}年{month + 1}月
        </span>
        <button
          type="button"
          onClick={onToday}
          aria-label="今日へ"
          className="relative z-10 rounded-lg px-2 py-0.5 text-[13px] font-medium text-[var(--gyokan-accent2)] hover:bg-blue-50"
        >
          今日
        </button>
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
      <div
        className="grid min-h-0 flex-1 grid-cols-7 border-l border-black/[0.05]"
        style={{ gridTemplateRows: "repeat(6, 1fr)" }}
      >
        {cells.map((cell, i) => (
          <DayCell
            key={`${cell.iso}-${i}`}
            cell={cell}
            cellIndex={i}
            isToday={cell.inMonth && cell.iso === today}
            dayTasks={tasksByDate.get(cell.iso) ?? []}
            dayEvents={eventsByDate.get(cell.iso) ?? []}
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
  onToggleTask,
}: {
  events: AppEvent[];
  tasks: AppTask[];
  onAddEvent: (data: { title: string; startTime: string; endTime?: string | null; memo?: string }) => void;
  onToggleTask: (id: string) => void;
}) {
  const [cursor, setCursor] = useState<MonthCursor>(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const eventsByDate = useMemo(() => groupEventsByDate(events), [events]);
  const tasksByDate = useMemo(() => groupTasksByDate(tasks), [tasks]);
  // Three panels — previous / current / next — form the swipeable track,
  // same pattern as elsewhere in this codebase (real-time drag via a
  // directly-mutated transform, then an eased release).
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

  // Swipe: real-time 1:1 finger-follow via a directly-mutated transform (no
  // native scrolling involved), then an eased release into place. Confirmed
  // horizontal drags call preventDefault so a diagonal swipe never turns
  // into a vertical page scroll — touch-action: pan-x and
  // overscroll-behavior: contain below back that up at the CSS level.
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

  const goToToday = useCallback(() => {
    const d = new Date();
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
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
      <div
        ref={containerRef}
        className="relative flex min-h-0 flex-1 overflow-hidden"
        style={{ touchAction: "pan-x", overscrollBehavior: "contain" }}
      >
        <div ref={trackRef} className="flex shrink-0" style={{ width: "300%" }}>
          {panels.map((p, i) => (
            <div key={i} className="flex min-h-0 shrink-0 flex-col" style={{ width: `${100 / 3}%` }}>
              <MonthPanel
                year={p.year}
                month={p.month}
                tasksByDate={tasksByDate}
                eventsByDate={eventsByDate}
                onSelect={handleDaySelect}
                onToday={goToToday}
              />
            </div>
          ))}
        </div>
      </div>

      {selectedDate && (
        <DayEventPopup
          dateISO={selectedDate}
          dateLabel={selectedDateLabel}
          dayEvents={selectedDayEvents}
          dayTasks={selectedDayTasks}
          onToggleTask={onToggleTask}
          onAddEvent={onAddEvent}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
