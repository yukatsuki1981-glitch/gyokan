"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useGyokanEvents } from "@/lib/gyokan/use-gyokan-events";
import { PrivateCalendar } from "./PrivateCalendar";

// Tailwind's default `lg` breakpoint — below this, the calendar fills the
// remaining viewport height under the shared header instead of sitting in
// a fixed-height desktop card.
const LG_BREAKPOINT = 1024;

/**
 * Embedded private-mode calendar.
 *
 * The header (menu, mode switch, date, refresh) is the same shared
 * <header> used in tasks mode — this component never renders its own. On
 * mobile it measures the space remaining below that header and fills it
 * exactly, so it reads as full-screen without needing to overlay/hide the
 * header. On desktop it renders inline at a fixed height inside the middle
 * column where "今日のタスク" normally shows, leaving the left project
 * sidebar and the right-hand calendar/memo panel untouched.
 */
export function PrivateModeSection() {
  const { authReady, dataReady, loadError, events, addEvent, updateEvent, deleteEvent, replaceEvents } =
    useGyokanEvents();

  const ready = authReady && dataReady;

  const rootRef = useRef<HTMLDivElement>(null);
  const [mobileHeightPx, setMobileHeightPx] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;

    const update = () => {
      if (window.innerWidth >= LG_BREAKPOINT) {
        setMobileHeightPx(null);
        return;
      }
      const top = el.getBoundingClientRect().top;
      setMobileHeightPx(Math.max(320, window.innerHeight - top));
    };

    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    // Mobile browsers resize the visual viewport (toolbar show/hide)
    // without always firing a plain `resize` event.
    window.visualViewport?.addEventListener("resize", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      window.visualViewport?.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      className="flex flex-col overflow-hidden bg-[#fafafa] lg:h-[640px] lg:rounded-2xl lg:border lg:border-black/[0.06] lg:bg-white lg:shadow-sm"
      style={mobileHeightPx != null ? { height: mobileHeightPx, paddingBottom: "env(safe-area-inset-bottom)" } : undefined}
    >
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
