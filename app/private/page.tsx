"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useGyokanEvents } from "@/lib/gyokan/use-gyokan-events";
import { PrivateCalendar } from "@/components/private/PrivateCalendar";
import { ListIcon, LockIcon } from "@/components/private/icons";

function ModeToggle() {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-full bg-black/[0.04] p-0.5">
      <Link
        href="/"
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ListIcon className="h-3 w-3" />
        タスク管理
      </Link>
      <span className="flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-gray-900 shadow-sm">
        <LockIcon className="h-3 w-3" />
        プライベート
      </span>
    </div>
  );
}

export default function PrivatePage() {
  const router = useRouter();
  const { user, authReady, dataReady, loadError, events, addEvent, updateEvent, deleteEvent, replaceEvents } =
    useGyokanEvents();

  useEffect(() => {
    if (!authReady) return;
    if (!user) router.replace("/login");
  }, [authReady, user, router]);

  if (!authReady || (user && !dataReady)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#fafafa] px-6">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
        {loadError && (
          <p className="max-w-sm text-center text-[13px] text-red-600">
            データの読み込みに問題があります: {loadError}
          </p>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#fafafa] px-6">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
        <p className="text-[13px] text-gray-400">ログイン画面へ移動しています…</p>
      </div>
    );
  }

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#fafafa]">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-black/[0.06] bg-white px-3 py-2.5 sm:px-4">
        <span className="text-[14px] font-semibold text-gray-900">行間</span>
        <ModeToggle />
      </header>
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
    </div>
  );
}
