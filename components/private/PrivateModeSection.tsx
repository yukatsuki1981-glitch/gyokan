"use client";

import { useCallback, useEffect, useMemo } from "react";
import type { AppTask } from "@/lib/gyokan/types";
import { createClient } from "@/lib/supabase/client";
import type { EventSharing } from "@/lib/gyokan/event-sharing";
import { fetchEventHistory } from "@/lib/gyokan/repository";
import { useGyokanEvents } from "@/lib/gyokan/use-gyokan-events";
import { useHousehold } from "@/lib/gyokan/use-household";
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
 *
 * Events include the family's shared ones (RLS decides what is returned);
 * the household (members and their display names) is loaded here for the
 * 自分だけ/共有 switch and the "〇〇さんが追加" / edit-history labels.
 */
export function PrivateModeSection({
  tasks,
  onToggleTask,
  viewDateISO,
  onViewDateChange,
}: {
  tasks: AppTask[];
  onToggleTask: (id: string) => void;
  /** The app's selected date; the month calendar shows (and moves) its month. */
  viewDateISO: string;
  onViewDateChange: (iso: string) => void;
}) {
  const { user, authReady, dataReady, loadError, saveError, events, addEvent, updateEvent, deleteEvent, replaceEvents } =
    useGyokanEvents();
  const household = useHousehold(user?.id);

  // Names can change while the app is in the background, like the events.
  const reloadHousehold = household.reload;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void reloadHousehold();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [reloadHousehold]);

  const loadHistory = useCallback((eventId: string) => fetchEventHistory(createClient(), eventId), []);
  const sharing = useMemo<EventSharing>(
    () => ({
      myUserId: user?.id ?? null,
      hasFamily: household.members.some((m) => !m.isMe),
      members: household.members,
      loadHistory,
    }),
    [user?.id, household.members, loadHistory],
  );

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
    <div className="flex min-h-full flex-col bg-[#fafafa] lg:h-full lg:min-h-0 lg:flex-1 lg:bg-transparent">
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
            sharing={sharing}
            onAddEvent={addEvent}
            onUpdateEvent={updateEvent}
            onDeleteEvent={deleteEvent}
            onReplaceEvents={replaceEvents}
            onToggleTask={onToggleTask}
            viewDateISO={viewDateISO}
            onViewDateChange={onViewDateChange}
          />
        </>
      )}
    </div>
  );
}
