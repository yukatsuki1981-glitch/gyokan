"use client";

import { useCallback, useRef, useState, type TouchEvent as ReactTouchEvent } from "react";
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { AppEvent, AppTask } from "@/lib/gyokan/types";
import type { EventDraftFields } from "@/lib/gyokan/drafts";
import { isAllDayEvent, localTimeHHMMFromTimestamp } from "@/lib/gyokan/events";
import { makeCubicBezierEasing } from "@/lib/gyokan/easing";
import { ThemedTaskCheckbox } from "@/components/themed-task-checkbox";
import { AddEventForm, EditEventForm } from "./EventForm";
import { GripIcon, PlusIcon, XIcon } from "./icons";

// Matches the calendar's month-swipe release feel.
const SHEET_DISMISS_EASING = makeCubicBezierEasing(0.22, 1, 0.36, 1);
const SHEET_DISMISS_DURATION_MS = 260;

function reorderById<T extends { id: string }>(
  prev: T[],
  visible: T[],
  activeId: string | number,
  overId: string | number,
): T[] {
  const oldIndex = visible.findIndex((e) => e.id === activeId);
  const newIndex = visible.findIndex((e) => e.id === overId);
  if (oldIndex === -1 || newIndex === -1) return prev;

  const reordered = arrayMove(visible, oldIndex, newIndex);
  const visibleIds = new Set(visible.map((e) => e.id));
  let idx = 0;
  return prev.map((e) => (visibleIds.has(e.id) ? reordered[idx++]! : e));
}

function timeRangeLabel(event: AppEvent) {
  if (isAllDayEvent(event)) return "終日";
  const start = localTimeHHMMFromTimestamp(event.startTime);
  if (!event.endTime) return start;
  return `${start}〜${localTimeHHMMFromTimestamp(event.endTime)}`;
}

/** Rounded-square stand-in for a checkbox, marking that events have no
 * "done" concept (unlike tasks, which use a round checkbox). */
function EventMarker() {
  return (
    <span
      aria-hidden
      className="h-[18px] w-[18px] shrink-0 rounded-[5px] border-[1.5px] border-emerald-300 bg-emerald-50"
    />
  );
}

function EventRowContent({
  event,
  onOpen,
  isDragging = false,
  dragHandleProps,
}: {
  event: AppEvent;
  onOpen: (event: AppEvent) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      onClick={() => onOpen(event)}
      className={`flex w-full cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-2 transition-all duration-200 ${
        isDragging
          ? "z-50 scale-[1.02] border-blue-200/60 bg-white shadow-[0_16px_32px_rgba(0,0,0,0.12)] ring-1 ring-blue-200/40"
          : "border-black/[0.06] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)] hover:-translate-y-0.5 hover:shadow-[0_6px_16px_rgba(0,0,0,0.06)]"
      }`}
    >
      <button
        type="button"
        aria-label="並び替え"
        onClick={(e) => e.stopPropagation()}
        style={{ touchAction: "none" }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:text-gray-500"
        {...dragHandleProps}
      >
        <GripIcon className="h-3.5 w-3.5" />
      </button>
      <EventMarker />
      <span className="w-[92px] shrink-0 text-[11px] font-medium text-gray-500">
        {timeRangeLabel(event)}
      </span>
      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-gray-900">
        {event.title}
      </p>
    </div>
  );
}

function SortableEventRow({
  event,
  onOpen,
}: {
  event: AppEvent;
  onOpen: (event: AppEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: event.id });

  return (
    <div
      ref={setNodeRef}
      className="min-w-0"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <EventRowContent
        event={event}
        onOpen={onOpen}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

function TaskRowContent({
  task,
  onToggle,
  isDragging = false,
  dragHandleProps,
}: {
  task: AppTask;
  onToggle: (id: string) => void;
  isDragging?: boolean;
  dragHandleProps?: Record<string, unknown>;
}) {
  return (
    <div
      className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-2 transition-all duration-200 ${
        isDragging
          ? "z-50 scale-[1.02] border-blue-200/60 bg-white shadow-[0_16px_32px_rgba(0,0,0,0.12)] ring-1 ring-blue-200/40"
          : "border-black/[0.06] bg-white/90 shadow-[0_1px_2px_rgba(0,0,0,0.03)]"
      }`}
    >
      <button
        type="button"
        aria-label="並び替え"
        style={{ touchAction: "none" }}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-gray-300 hover:text-gray-500"
        {...dragHandleProps}
      >
        <GripIcon className="h-3.5 w-3.5" />
      </button>
      <ThemedTaskCheckbox
        done={task.done}
        size="sm"
        onClick={() => onToggle(task.id)}
        aria-label={task.done ? "未完了に戻す" : "完了にする"}
      />
      <p
        className={`min-w-0 flex-1 truncate text-[13px] font-medium ${
          task.done ? "text-gray-400 line-through" : "text-gray-900"
        }`}
      >
        {task.title}
      </p>
    </div>
  );
}

function SortableTaskRow({
  task,
  onToggle,
}: {
  task: AppTask;
  onToggle: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });

  return (
    <div
      ref={setNodeRef}
      className="min-w-0"
      style={{
        transform: CSS.Transform.toString(transform),
        transition: isDragging ? undefined : transition,
        zIndex: isDragging ? 50 : undefined,
      }}
    >
      <TaskRowContent
        task={task}
        onToggle={onToggle}
        isDragging={isDragging}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}

export function DayEventsModal({
  dateISO,
  dateLabel,
  dayEvents,
  dayTasks,
  taskSectionLabel,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onReplaceEvents,
  onToggleTask,
  onReplaceTasks,
  onClose,
}: {
  dateISO: string;
  dateLabel: string;
  dayEvents: AppEvent[];
  dayTasks: AppTask[];
  taskSectionLabel: string;
  onAddEvent: (data: { title: string; startTime: string; endTime?: string | null; memo?: string }) => void;
  onUpdateEvent: (
    id: string,
    patch: { title: string; startTime: string; endTime?: string | null; memo?: string },
  ) => void | Promise<boolean>;
  onDeleteEvent: (id: string) => void;
  onReplaceEvents: (updater: (prev: AppEvent[]) => AppEvent[]) => void;
  onToggleTask: (id: string) => void;
  onReplaceTasks: (updater: (prev: AppTask[]) => AppTask[]) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<{ kind: "list" } | { kind: "add" } | { kind: "edit"; event: AppEvent }>(
    () => (dayEvents.length === 0 ? { kind: "add" } : { kind: "list" }),
  );

  const sheetRef = useRef<HTMLDivElement>(null);
  const cancelAnimRef = useRef<(() => void) | null>(null);
  const dragStartYRef = useRef(0);
  const draggingRef = useRef(false);

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
        sheet.style.transform = `translateY(${targetPx}px)`;
        onDone?.();
        return;
      }
      const startTime = performance.now();
      let cancelled = false;
      const step = (now: number) => {
        if (cancelled) return;
        const progress = Math.min(1, (now - startTime) / SHEET_DISMISS_DURATION_MS);
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

  const handleGripTouchStart = (e: ReactTouchEvent) => {
    cancelAnimRef.current?.();
    cancelAnimRef.current = null;
    dragStartYRef.current = e.touches[0]?.clientY ?? 0;
    draggingRef.current = true;
    if (sheetRef.current) sheetRef.current.style.transition = "none";
  };

  const handleGripTouchMove = (e: ReactTouchEvent) => {
    if (!draggingRef.current) return;
    const dy = Math.max(0, (e.touches[0]?.clientY ?? 0) - dragStartYRef.current);
    if (sheetRef.current) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };

  const handleGripTouchEnd = (e: ReactTouchEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const dy = Math.max(0, (e.changedTouches[0]?.clientY ?? 0) - dragStartYRef.current);
    const sheetHeight = sheetRef.current?.getBoundingClientRect().height ?? 0;
    const threshold = Math.max(60, sheetHeight * 0.25);

    if (dy >= threshold) {
      animateSheetTo(dy, sheetHeight + 40, onClose);
    } else {
      animateSheetTo(dy, 0, null);
    }
  };

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 280, tolerance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleEventDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReplaceEvents((prev) => reorderById(prev, dayEvents, active.id, over.id));
  };

  const handleTaskDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    onReplaceTasks((prev) => reorderById(prev, dayTasks, active.id, over.id));
  };

  const combineTimeToISO = (hhmm: string): string => {
    const [h, m] = hhmm.split(":").map((v) => parseInt(v, 10));
    const [y, mo, d] = dateISO.split("-").map((v) => parseInt(v, 10));
    return new Date(y, (mo || 1) - 1, d || 1, h || 0, m || 0, 0, 0).toISOString();
  };

  const handleAdd = (values: EventDraftFields) => {
    onAddEvent({
      title: values.title,
      startTime: values.allDay ? combineTimeToISO("00:00") : combineTimeToISO(values.startTime),
      endTime: values.allDay ? null : values.endTime ? combineTimeToISO(values.endTime) : null,
      memo: values.memo,
    });
  };

  const handleSave = async (id: string, values: EventDraftFields) => {
    return onUpdateEvent(id, {
      title: values.title,
      startTime: values.allDay ? combineTimeToISO("00:00") : combineTimeToISO(values.startTime),
      endTime: values.allDay ? null : values.endTime ? combineTimeToISO(values.endTime) : null,
      memo: values.memo,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-0 sm:items-center sm:px-4"
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className={`flex w-full flex-col overflow-hidden rounded-t-2xl bg-[#fafafa] shadow-2xl sm:h-auto sm:max-h-[85vh] sm:max-w-md sm:rounded-2xl ${
          view.kind === "list" ? "h-[50vh]" : "h-[80vh]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-center py-2 sm:hidden"
          style={{ touchAction: "none" }}
          onTouchStart={handleGripTouchStart}
          onTouchMove={handleGripTouchMove}
          onTouchEnd={handleGripTouchEnd}
          onTouchCancel={handleGripTouchEnd}
        >
          <span className="h-1 w-9 rounded-full bg-black/15" />
        </div>
        {view.kind === "list" ? (
          <>
            <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] px-4 py-3">
              <h2 className="text-[14px] font-semibold text-gray-900">{dateLabel}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="閉じる"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-black/[0.04] text-gray-500 transition-colors hover:bg-black/[0.08]"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <section className="mb-4">
                <h3 className="mb-1.5 text-[11px] font-semibold text-gray-400">予定</h3>
                {dayEvents.length === 0 ? (
                  <p className="py-3 text-center text-[12px] text-gray-400">
                    この日の予定はまだありません
                  </p>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleEventDragEnd}>
                    <SortableContext items={dayEvents.map((e) => e.id)} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-1.5">
                        {dayEvents.map((event) => (
                          <SortableEventRow
                            key={event.id}
                            event={event}
                            onOpen={(e) => setView({ kind: "edit", event: e })}
                          />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                )}
              </section>

              {dayTasks.length > 0 && (
                <section>
                  <h3 className="mb-1.5 text-[11px] font-semibold text-gray-400">{taskSectionLabel}</h3>
                  <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={handleTaskDragEnd}>
                    <SortableContext items={dayTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      <div className="flex flex-col gap-1.5">
                        {dayTasks.map((task) => (
                          <SortableTaskRow key={task.id} task={task} onToggle={onToggleTask} />
                        ))}
                      </div>
                    </SortableContext>
                  </DndContext>
                </section>
              )}
            </div>

            <div className="shrink-0 border-t border-black/[0.06] px-4 py-3">
              <button
                type="button"
                onClick={() => setView({ kind: "add" })}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#007AFF] px-4 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-[#0066d6]"
              >
                <PlusIcon className="h-4 w-4" />
                予定を追加
              </button>
            </div>
          </>
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
            {view.kind === "add" ? (
              <AddEventForm onAdd={handleAdd} onClose={() => setView({ kind: "list" })} />
            ) : (
              <EditEventForm
                item={view.event}
                onSave={handleSave}
                onDelete={onDeleteEvent}
                onClose={() => setView({ kind: "list" })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
