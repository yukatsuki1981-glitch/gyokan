"use client";

import { useMemo, useState } from "react";
import type { AppEvent, AppTask } from "@/lib/gyokan/types";
import { groupEventsByDate, truncateEventTitle } from "@/lib/gyokan/events";
import { getJapaneseCalendarDay } from "@/lib/gyokan/japanese-calendar-days";
import { ChevronLeftIcon, ChevronRightIcon } from "./icons";
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
type CalendarCell = { day: number; iso: string };

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];
const CHIP_PREVIEW_MAX = 4;

function isoOf(year: number, month: number, day: number) {
  const y = year;
  const m = String(month + 1).padStart(2, "0");
  const d = String(day).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function todayISO() {
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}

function shiftCursor(cursor: MonthCursor, delta: number): MonthCursor {
  const d = new Date(cursor.year, cursor.month + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

// Leading blanks to align the 1st onto its weekday, then every day of the
// month — no trailing next-month fill (that, and always padding to 6 rows,
// is deferred). Row count is whatever this month actually needs (5 or 6).
function buildGridCells(year: number, month: number): (CalendarCell | null)[] {
  const first = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (CalendarCell | null)[] = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, iso: isoOf(year, month, day) });
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
  const dayInfo = getJapaneseCalendarDay(cell.iso);

  const chips: DayChip[] = [
    ...dayTasks.map((task): DayChip => ({ kind: "task", task })),
    ...dayEvents.map((event): DayChip => ({ kind: "event", event })),
  ];
  const preview = chips.slice(0, CHIP_PREVIEW_MAX);
  const overflow = chips.length > CHIP_PREVIEW_MAX ? chips.length - CHIP_PREVIEW_MAX : 0;

  const numberColor = isToday
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
      className="flex min-h-0 flex-col items-stretch overflow-hidden border-b border-r border-black/[0.05] bg-white p-1 text-left transition-colors hover:bg-black/[0.02]"
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
              className="truncate rounded-full bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium leading-[15px] text-blue-700"
              title={chip.task.title}
            >
              {truncateEventTitle(chip.task.title)}
            </span>
          ) : (
            <span
              key={`e-${chip.event.id}`}
              className="truncate rounded-[4px] bg-emerald-50 px-1 py-0.5 text-[11px] font-medium leading-[15px] text-emerald-700"
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
  const cells = useMemo(() => buildGridCells(cursor.year, cursor.month), [cursor]);
  const weekCount = Math.ceil(cells.length / 7);
  const today = todayISO();

  const monthLabel = `${cursor.year}年${cursor.month + 1}月`;

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
      <div className="relative flex shrink-0 items-center justify-between px-3 py-1 sm:px-4">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCursor((c) => shiftCursor(c, -1))}
            aria-label="前の月"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-black/[0.04]"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setCursor((c) => shiftCursor(c, 1))}
            aria-label="次の月"
            className="rounded-lg p-1.5 text-gray-500 hover:bg-black/[0.04]"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <span className="text-[15px] font-semibold text-gray-900">{monthLabel}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            const d = new Date();
            setCursor({ year: d.getFullYear(), month: d.getMonth() });
          }}
          className="rounded-lg px-2 py-0.5 text-[13px] font-medium text-[var(--gyokan-accent2)] hover:bg-blue-50"
        >
          今日
        </button>
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
        style={{ gridTemplateRows: `repeat(${weekCount}, 1fr)` }}
      >
        {cells.map((cell, i) =>
          cell ? (
            <DayCell
              key={cell.iso}
              cell={cell}
              cellIndex={i}
              isToday={cell.iso === today}
              dayTasks={tasksByDate.get(cell.iso) ?? []}
              dayEvents={eventsByDate.get(cell.iso) ?? []}
              onSelect={setSelectedDate}
            />
          ) : (
            <div key={`blank-${i}`} className="border-b border-r border-black/[0.05] bg-gray-50/60" />
          ),
        )}
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
