"use client";

import { useMemo } from "react";
import type { AppTask } from "@/lib/gyokan/types";
import { useGyokanEvents } from "@/lib/gyokan/use-gyokan-events";
import { PrivateCalendar } from "./PrivateCalendar";

/**
 * Private-mode content area.
 *
 * The header and footer are NOT rendered here; they live in app/page.tsx
 * as the same shared elements tasks mode uses. This component only fills
 * the space between them.
 *
 * Owns its own events data (useGyokanEvents — separate from useGyokanData
 * so tasks-mode logic is never touched here) and filters both tasks and
 * events down to scope==='private' before handing them to PrivateCalendar.
 * scope='work' data (tasks-mode's own tasks) must never reach this screen.
 */
export function PrivateModeSection({
  tasks,
  onToggleTask,
}: {
  tasks: AppTask[];
  onToggleTask: (id: string) => void;
}) {
  const { authReady, dataReady, loadError, saveError, events, addEvent, updateEvent, deleteEvent, replaceEvents } =
    useGyokanEvents();

  const ready = authReady && dataReady;
  const privateEvents = useMemo(
    () => events.filter((e) => (e.scope ?? "private") === "private"),
    [events],
  );
  const privateTasks = useMemo(
    () => tasks.filter((t) => (t.scope ?? "work") === "private"),
    [tasks],
  );

  return (
    <div className="flex min-h-full flex-col bg-[#fafafa] lg:h-full lg:bg-transparent">
      {!ready ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
        </div>
      ) : (
        <>
          {loadError && (
            <p className="shrink-0 bg-red-50 px-4 py-2 text-center text-[12px] text-red-600">
              データの読み込みに問題があります: {loadError}
            </p>
          )}
          {saveError && (
            <p className="shrink-0 bg-red-50 px-4 py-2 text-center text-[12px] text-red-600">
              保存に失敗しました: {saveError}
            </p>
          )}
          <PrivateCalendar
            events={privateEvents}
            tasks={privateTasks}
            onAddEvent={addEvent}
            onUpdateEvent={updateEvent}
            onDeleteEvent={deleteEvent}
            onReplaceEvents={replaceEvents}
            onToggleTask={onToggleTask}
          />
        </>
      )}
    </div>
  );
}
