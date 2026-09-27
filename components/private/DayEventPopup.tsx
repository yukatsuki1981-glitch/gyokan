"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  DndContext,
  closestCorners,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AppEvent, AppTask } from "@/lib/gyokan/types";
import {
  combineLocalDateAndTime,
  eventFieldsFromItem,
  isAllDayEvent,
  localDateISOFromTimestamp,
  localTimeHHMMFromTimestamp,
  sortEventsByOrder,
} from "@/lib/gyokan/events";
import { DEFAULT_EVENT_COLOR, EVENT_COLOR_PALETTE, eventColorStyle } from "@/lib/gyokan/event-colors";
import { makeCubicBezierEasing } from "@/lib/gyokan/easing";
import { ThemedTaskCheckbox } from "@/components/themed-task-checkbox";
import { GripIcon, TrashIcon, XIcon } from "./icons";

const SHEET_DISMISS_EASING = makeCubicBezierEasing(0.22, 1, 0.36, 1);
const SHEET_DISMISS_DURATION_MS = 260;

function sortTasksByOrder(tasks: AppTask[]): AppTask[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
}

function timeRangeLabel(event: AppEvent): string {
  if (isAllDayEvent(event)) return "終日";
  const start = localTimeHHMMFromTimestamp(event.startTime);
  if (!event.endTime) return start;
  const end = localTimeHHMMFromTimestamp(event.endTime);
  return `${start} - ${end}`;
}

// Mirrors reorderTasksInList in app/page.tsx: reorder within the visible
// (this-day) subset, then splice the result back into the full array so
// other days' relative order (and their sortOrder values) is untouched.
function reorderEventsInList(
  prev: AppEvent[],
  visible: AppEvent[],
  activeId: string,
  overId: string,
): AppEvent[] {
  const oldIndex = visible.findIndex((e) => e.id === activeId);
  const newIndex = visible.findIndex((e) => e.id === overId);
  if (oldIndex === -1 || newIndex === -1) return prev;

  const reordered = arrayMove(visible, oldIndex, newIndex);
  const visibleIds = new Set(visible.map((e) => e.id));
  let nextIdx = 0;
  return prev.map((e) => (visibleIds.has(e.id) ? reordered[nextIdx++]! : e));
}

function SortableEventRow({
  event,
  onOpen,
  onDelete,
}: {
  event: AppEvent;
  onOpen: (event: AppEvent) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: event.id,
  });

  return (
    <li
      ref={setNodeRef}
      onClick={() => onOpen(event)}
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 50 : undefined,
      }}
      className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 transition-colors ${
        isDragging
          ? "border-blue-200/60 bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]"
          : "border-black/[0.04] bg-white hover:bg-black/[0.02]"
      }`}
    >
      <button
        type="button"
        aria-label="並び替え"
        onClick={(e) => e.stopPropagation()}
        className="flex h-5 w-4 shrink-0 cursor-grab items-center justify-center text-gray-300 hover:text-gray-500 active:cursor-grabbing"
        style={{ touchAction: "none" }}
        {...attributes}
        {...listeners}
      >
        <GripIcon className="h-3.5 w-3.5" />
      </button>
      <span
        className="h-[14px] w-[14px] shrink-0 rounded-[4px]"
        style={{ backgroundColor: eventColorStyle(event.color).accent }}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] text-gray-800">{event.title}</span>
      <span className="shrink-0 text-[11px] text-gray-400">{timeRangeLabel(event)}</span>
      <button
        type="button"
        aria-label="削除"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(event.id);
        }}
        className="shrink-0 rounded-md p-1 text-gray-300 hover:bg-rose-50 hover:text-rose-500"
      >
        <TrashIcon className="h-3 w-3" />
      </button>
    </li>
  );
}

function ColorSwatchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-1">
      {EVENT_COLOR_PALETTE.map((color) => {
        const selected = color.toUpperCase() === value.toUpperCase();
        return (
          <button
            key={color}
            type="button"
            aria-label={`色を選択 ${color}`}
            aria-pressed={selected}
            onClick={() => onChange(color)}
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-transform ${
              selected ? "ring-2 ring-offset-1" : ""
            }`}
            style={
              selected
                ? ({ backgroundColor: color, "--tw-ring-color": color } as React.CSSProperties)
                : { backgroundColor: color }
            }
          >
            {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
          </button>
        );
      })}
    </div>
  );
}

type View = "list" | "add" | "edit";

export function DayEventPopup({
  dateISO,
  dateLabel,
  dayEvents,
  dayTasks,
  onToggleTask,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onReplaceEvents,
  onClose,
}: {
  dateISO: string;
  dateLabel: string;
  dayEvents: AppEvent[];
  dayTasks: AppTask[];
  onToggleTask: (id: string) => void;
  onAddEvent: (data: {
    title: string;
    startTime: string;
    endTime?: string | null;
    memo?: string;
    color?: string | null;
  }) => void;
  onUpdateEvent: (
    id: string,
    patch: { title: string; startTime: string; endTime?: string | null; memo?: string; color?: string | null },
  ) => void;
  onDeleteEvent: (id: string) => void;
  onReplaceEvents: (updater: (prev: AppEvent[]) => AppEvent[]) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>(() => (dayEvents.length === 0 ? "add" : "list"));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("");
  const [memo, setMemo] = useState("");
  const [color, setColor] = useState(DEFAULT_EVENT_COLOR);

  // The sheet is sized from the *visual* viewport, not 95vh of the layout
  // viewport. With the keyboard open the layout viewport doesn't shrink, so
  // a 95vh sheet kept ~1/3 of itself (including the memo field's lower half
  // and the save button) behind the keyboard — and because its content box
  // was then exactly as tall as its content, there was nothing to scroll to
  // reach them. Tracking the visible height instead means the content area
  // genuinely overflows while the keyboard is up, so it scrolls normally.
  const [vpHeight, setVpHeight] = useState<number | null>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setVpHeight(vv.height);
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleEventDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      onReplaceEvents((prev) => {
        const visible = prev.filter((e) => localDateISOFromTimestamp(e.startTime) === dateISO);
        return reorderEventsInList(prev, visible, String(active.id), String(over.id));
      });
    },
    [dateISO, onReplaceEvents],
  );

  const sheetRef = useRef<HTMLDivElement>(null);
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

  const contentRef = useRef<HTMLDivElement>(null);

  // Swipe-to-dismiss works from anywhere on the sheet — not just the grip
  // handle — except: (1) single-line inputs/select/contenteditable, so
  // normal text selection and caret dragging isn't hijacked, and (2) the
  // event-list drag handles, so a downward drag-to-reorder isn't mistaken
  // for a dismiss before dnd-kit's own activation delay has a chance to
  // claim it. Raw DOM listeners (not React's onTouchMove prop) are used so
  // preventDefault reliably suppresses the browser's own scroll/bounce once
  // a dismiss-drag is confirmed — same technique as the month-swipe gesture
  // in PrivateCalendar.tsx.
  //
  // Direction is judged per touchmove step (this event's Y vs. the previous
  // event's Y), not cumulatively from where the touch started. An earlier
  // version compared against the touch's start position, which broke
  // scrolling back up after scrolling down within the same touch: once the
  // finger had moved far enough past the start point to read as "downward
  // overall", any leftover scrollable room was still gated correctly, but a
  // single continuous drag that scrolls down a long way and then reverses
  // spends a long stretch where the cumulative delta is still negative (or
  // barely positive) relative to the start — during which real touch
  // hardware's momentum/rubber-banding could disagree with that stale
  // baseline. Per-step direction has no such baseline to go stale: each
  // event is judged only against the scrollable's *current* scrollTop, so
  // scrolling back and forth any number of times within one touch always
  // works, and a dismiss is confirmed only at the exact step where the
  // scrollable is already at scrollTop 0 and the finger keeps moving down.
  // Once confirmed, the sheet's own drag distance is re-baselined to start
  // from that moment (not from the touch's original start point), so the
  // release/threshold math isn't polluted by whatever scrolling happened
  // before the dismiss began.
  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const isFullyExcludedTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return !!target.closest(
        "input, select, [contenteditable='true'], button[aria-label='並び替え']",
      );
    };

    // Walks target -> sheet looking for anything that can still absorb a
    // downward drag, mirroring the browser's own scroll chaining. The
    // previous version picked a single element (the memo textarea if the
    // touch was inside one, else the content area) and judged only that:
    // so a touch starting on a textarea that was already at its top made
    // the sheet dismiss even when the content area behind it still had
    // plenty of room to scroll — the exact "it won't scroll back, and a
    // firmer drag closes it" report.
    const findScrollableForGesture = (target: EventTarget | null): HTMLElement | null => {
      let node = target instanceof HTMLElement ? target : null;
      while (node) {
        const style = getComputedStyle(node);
        const scrollable =
          node instanceof HTMLTextAreaElement ||
          style.overflowY === "auto" ||
          style.overflowY === "scroll";
        // delta is always downward here, so "can absorb it" means room above.
        if (scrollable && node.scrollHeight > node.clientHeight && node.scrollTop > 0) {
          return node;
        }
        if (node === sheet) break;
        node = node.parentElement;
      }
      return null;
    };

    let dragging = false;
    let confirmed = false;
    let lastY = 0;
    let dismissStartY = 0;

    const onTouchStart = (e: TouchEvent) => {
      if (isFullyExcludedTarget(e.target)) {
        dragging = false;
        return;
      }
      cancelAnimRef.current?.();
      cancelAnimRef.current = null;
      const y = e.touches[0]?.clientY ?? 0;
      lastY = y;
      dismissStartY = y;
      dragging = true;
      confirmed = false;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      const y = e.touches[0]?.clientY ?? 0;
      const stepDelta = y - lastY;
      lastY = y;

      if (confirmed) {
        e.preventDefault();
        sheet.style.transition = "none";
        sheet.style.transform = `translateY(${Math.max(0, y - dismissStartY)}px)`;
        return;
      }

      if (stepDelta <= 0) return; // moving up this step — always let it scroll natively

      // Anything in the chain still has room to scroll up: let it.
      if (findScrollableForGesture(e.target)) return;

      // At the scroll-top edge and still moving down this step: confirm the
      // dismiss, re-baselined to start tracking from right here.
      confirmed = true;
      dismissStartY = y;
      e.preventDefault();
      sheet.style.transition = "none";
      sheet.style.transform = "translateY(0px)";
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!dragging) return;
      dragging = false;
      if (!confirmed) return;
      const sheetHeight = sheet.getBoundingClientRect().height;
      const y = e.changedTouches[0]?.clientY ?? lastY;
      const dy = Math.max(0, y - dismissStartY);
      const threshold = Math.max(60, sheetHeight * 0.25);
      if (dy >= threshold) {
        animateSheetTo(dy, sheetHeight + 40, onClose);
      } else {
        animateSheetTo(dy, 0, null);
      }
    };

    sheet.addEventListener("touchstart", onTouchStart, { passive: true });
    sheet.addEventListener("touchmove", onTouchMove, { passive: false });
    sheet.addEventListener("touchend", onTouchEnd, { passive: true });
    sheet.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      sheet.removeEventListener("touchstart", onTouchStart);
      sheet.removeEventListener("touchmove", onTouchMove);
      sheet.removeEventListener("touchend", onTouchEnd);
      sheet.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [animateSheetTo, onClose]);

  useEffect(() => {
    return () => {
      cancelAnimRef.current?.();
    };
  }, []);

  const resetForm = () => {
    setTitle("");
    setAllDay(false);
    setStartTime("09:00");
    setEndTime("");
    setMemo("");
    setColor(DEFAULT_EVENT_COLOR);
    setEditingId(null);
  };

  const openAdd = () => {
    resetForm();
    setView("add");
  };

  const openEdit = (event: AppEvent) => {
    const fields = eventFieldsFromItem(event);
    setTitle(fields.title);
    setAllDay(fields.allDay);
    setStartTime(fields.startTime || "09:00");
    setEndTime(fields.endTime);
    setMemo(fields.memo);
    setColor(fields.color || DEFAULT_EVENT_COLOR);
    setEditingId(event.id);
    setView("edit");
  };

  const handleSave = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const payload = allDay
      ? {
          title: trimmed,
          startTime: combineLocalDateAndTime(dateISO, "00:00"),
          endTime: null,
          memo: memo.trim() || undefined,
          color,
        }
      : {
          title: trimmed,
          startTime: combineLocalDateAndTime(dateISO, startTime),
          endTime: endTime ? combineLocalDateAndTime(dateISO, endTime) : null,
          memo: memo.trim() || undefined,
          color,
        };
    if (view === "edit" && editingId) {
      onUpdateEvent(editingId, payload);
    } else {
      onAddEvent(payload);
    }
    onClose();
  };

  const handleDeleteEditing = () => {
    if (!editingId) return;
    onDeleteEvent(editingId);
    onClose();
  };

  const sortedEvents = sortEventsByOrder(dayEvents);
  const sortedTasks = sortTasksByOrder(dayTasks);

  const isFormView = view === "add" || view === "edit";
  // Fall back to the old vh-based sizing only until the first
  // visualViewport measurement lands (or on browsers without the API).
  const sheetHeightStyle =
    vpHeight != null ? { height: Math.round(vpHeight * (isFormView ? 0.95 : 0.5)) } : undefined;

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-black/40 px-0 sm:items-center sm:px-4"
      style={vpHeight != null ? { height: Math.round(vpHeight) } : { bottom: 0 }}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        onClick={(e) => e.stopPropagation()}
        style={sheetHeightStyle}
        className={`flex w-full flex-col overflow-hidden rounded-t-2xl bg-[#fafafa] shadow-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl ${
          sheetHeightStyle ? "" : isFormView ? "h-[95vh]" : "h-[50vh]"
        }`}
      >
        <div className="flex shrink-0 flex-col items-center pb-1 pt-2 sm:hidden">
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

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
          {view === "list" ? (
            <>
              <section className="mb-4">
                <p className="mb-1.5 text-[11px] font-medium text-gray-400">予定</p>
                {sortedEvents.length === 0 ? (
                  <p className="text-[12px] text-gray-300">予定はありません</p>
                ) : (
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCorners}
                    onDragEnd={handleEventDragEnd}
                  >
                    <SortableContext
                      items={sortedEvents.map((e) => e.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <ul className="flex flex-col gap-1.5">
                        {sortedEvents.map((event) => (
                          <SortableEventRow
                            key={event.id}
                            event={event}
                            onOpen={openEdit}
                            onDelete={onDeleteEvent}
                          />
                        ))}
                      </ul>
                    </SortableContext>
                  </DndContext>
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
                onClick={openAdd}
                className="w-full rounded-xl border border-dashed border-black/[0.1] py-2.5 text-[13px] font-medium text-[var(--gyokan-accent2)] hover:bg-blue-50"
              >
                ＋ 予定を追加
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[11px] font-medium text-gray-400">
                {view === "edit" ? "予定を編集" : "予定を追加"}
              </p>
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
              <div className="flex rounded-xl bg-black/[0.05] p-0.5">
                <button
                  type="button"
                  onClick={() => setAllDay(false)}
                  className={`flex-1 rounded-[10px] py-1.5 text-[13px] font-medium transition-colors ${
                    !allDay ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                  }`}
                >
                  時間指定
                </button>
                <button
                  type="button"
                  onClick={() => setAllDay(true)}
                  className={`flex-1 rounded-[10px] py-1.5 text-[13px] font-medium transition-colors ${
                    allDay ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                  }`}
                >
                  終日
                </button>
              </div>
              {!allDay && (
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
              )}
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium text-gray-400">ラベルの色</span>
                <ColorSwatchPicker value={color} onChange={setColor} />
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
                {view === "edit" && (
                  <button
                    type="button"
                    onClick={handleDeleteEditing}
                    aria-label="削除"
                    className="rounded-xl border border-black/[0.08] px-3 py-2.5 text-rose-500 hover:bg-rose-50"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                )}
                {(view === "edit" || sortedEvents.length + sortedTasks.length > 0) && (
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
                  onClick={handleSave}
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
