"use client";

import { useGyokanEvents } from "@/lib/gyokan/use-gyokan-events";
import { PrivateCalendar } from "./PrivateCalendar";

/**
 * Embedded private-mode calendar.
 *
 * The header (menu, mode switch, date, refresh) is the same shared
 * <header> used in tasks mode — this component never renders its own.
 * On mobile the surrounding page shell becomes a fixed, non-scrolling
 * flex column (header / this content area / the private-mode footer)
 * whenever appMode is "private", so `h-full` here resolves against that
 * shell's own bounded height. On desktop it renders inline at a fixed
 * height inside the middle column where "今日のタスク" normally shows,
 * leaving the left project sidebar and the right-hand calendar/memo
 * panel untouched.
 */
export function PrivateModeSection() {
  const { authReady, dataReady, loadError, events, addEvent, updateEvent, deleteEvent, replaceEvents } =
    useGyokanEvents();

  const ready = authReady && dataReady;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#fafafa] lg:h-[640px] lg:rounded-2xl lg:border lg:border-black/[0.06] lg:bg-white lg:shadow-sm">
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
