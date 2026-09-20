"use client";

import { useGyokanEvents } from "@/lib/gyokan/use-gyokan-events";
import { PrivateCalendar } from "./PrivateCalendar";

/**
 * Embedded private-mode calendar.
 *
 * On mobile it takes over the whole viewport (a fixed overlay, since the
 * project sidebar and right-hand calendar panel are already hidden below
 * the `lg` breakpoint). On desktop it renders in place, sized to sit inside
 * the middle column where "今日のタスク" normally shows, leaving the left
 * project sidebar and the right-hand calendar/memo panel untouched.
 */
export function PrivateModeSection({ onExit }: { onExit: () => void }) {
  const { authReady, dataReady, loadError, events, addEvent, updateEvent, deleteEvent, replaceEvents } =
    useGyokanEvents();

  const ready = authReady && dataReady;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#fafafa] lg:static lg:inset-auto lg:z-auto lg:h-[640px] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-black/[0.06] lg:bg-white lg:shadow-sm">
      <div className="flex shrink-0 items-center justify-between border-b border-black/[0.06] bg-white px-3 py-2.5 lg:hidden">
        <span className="text-[14px] font-semibold text-gray-900">プライベート</span>
        <button
          type="button"
          onClick={onExit}
          className="rounded-full bg-black/[0.04] px-3 py-1 text-[11px] font-medium text-gray-600 transition-colors hover:bg-black/[0.08]"
        >
          タスク管理に戻る
        </button>
      </div>

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
          <PrivateCalendar
            events={events}
            onAddEvent={addEvent}
            onUpdateEvent={updateEvent}
            onDeleteEvent={deleteEvent}
            onReplaceEvents={replaceEvents}
          />
        </>
      )}
    </div>
  );
}
