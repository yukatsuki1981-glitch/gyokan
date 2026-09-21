"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { newUuid } from "./mappers";
import {
  assignSortOrders,
  deleteEventDb,
  fetchGyokanEvents,
  upsertEvent,
  upsertEventsBatch,
} from "./repository";
import {
  clearDraft,
  eventDraftDiffers,
  mergeEventsWithDrafts,
  readDraft,
  type EventDraftFields,
} from "./drafts";
import { applyEventDraft } from "./events";
import type { AppEvent } from "./types";

export type { AppEvent } from "./types";

function formatLoadError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: string }).message);
  }
  return "データの読み込みに失敗しました";
}

/**
 * Standalone data hook for private-mode events. Kept separate from
 * useGyokanData() so tasks-related state/logic is never touched here.
 *
 * Session check uses onAuthStateChange only — never getSession(), which is
 * known to deadlock Supabase auth when combined with it (see the comment in
 * use-gyokan-data.ts referencing issue #762).
 */
export function useGyokanEvents() {
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);
  const getSupabase = useCallback(() => {
    if (!supabaseRef.current) {
      supabaseRef.current = createClient();
    }
    return supabaseRef.current;
  }, []);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<AppEvent[]>([]);

  const userIdRef = useRef<string | null>(null);
  const initialLoadDoneRef = useRef(false);

  const flushPendingEventDrafts = useCallback(async (serverEvents: AppEvent[]) => {
    const uid = userIdRef.current;
    if (!uid) return;
    const supabase = getSupabase();
    for (const item of serverEvents) {
      const draft = readDraft<EventDraftFields>("event", item.id);
      if (!draft || !eventDraftDiffers(item, draft)) continue;
      const merged = applyEventDraft(item, draft);
      try {
        await upsertEvent(supabase, merged, uid);
        clearDraft("event", item.id);
      } catch (err) {
        console.error("Failed to flush event draft", err);
      }
    }
  }, [getSupabase]);

  const loadEvents = useCallback(async (uid: string, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? initialLoadDoneRef.current;
    if (!silent) setDataReady(false);
    setLoadError(null);
    try {
      const rows = await fetchGyokanEvents(getSupabase(), uid);
      setEvents(mergeEventsWithDrafts(rows));
      setLoadError(null);
      setDataReady(true);
      initialLoadDoneRef.current = true;
      void flushPendingEventDrafts(rows);
    } catch (err) {
      setLoadError(formatLoadError(err));
      setDataReady(true);
      initialLoadDoneRef.current = true;
    }
  }, [getSupabase, flushPendingEventDrafts]);

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabase();

    // Mirrors use-gyokan-data.ts: do not call getSession() here — running it
    // alongside onAuthStateChange can deadlock auth (issue #762).
    const scheduleLoad = (uid: string, silent: boolean) => {
      window.setTimeout(() => {
        if (!mounted) return;
        void loadEvents(uid, { silent });
      }, 0);
    };

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: AuthChangeEvent, session: Session | null) => {
        if (!mounted) return;
        const u = session?.user ?? null;
        setUser(u);
        userIdRef.current = u?.id ?? null;
        setAuthReady(true);

        if (!u) {
          setEvents([]);
          setDataReady(false);
          initialLoadDoneRef.current = false;
          return;
        }

        const silent = event !== "INITIAL_SESSION" && initialLoadDoneRef.current;
        scheduleLoad(u.id, silent);
      },
    );

    const authFallback = window.setTimeout(() => {
      if (!mounted) return;
      setAuthReady(true);
    }, 8000);

    return () => {
      mounted = false;
      window.clearTimeout(authFallback);
      subscription.unsubscribe();
    };
  }, [getSupabase, loadEvents]);

  const persistEvent = useCallback(async (event: AppEvent): Promise<boolean> => {
    const uid = userIdRef.current;
    if (!uid) return false;
    try {
      await upsertEvent(getSupabase(), event, uid);
      clearDraft("event", event.id);
      return true;
    } catch (err) {
      console.error("Failed to save event", err);
      return false;
    }
  }, [getSupabase]);

  const persistEvents = useCallback(async (list: AppEvent[]) => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      await upsertEventsBatch(getSupabase(), list, uid);
    } catch (err) {
      console.error("Failed to save events", err);
    }
  }, [getSupabase]);

  const addEvent = useCallback((data: {
    title: string;
    startTime: string;
    endTime?: string | null;
    memo?: string;
  }) => {
    const event: AppEvent = {
      id: newUuid(),
      title: data.title.trim(),
      startTime: data.startTime,
      endTime: data.endTime ?? null,
      memo: data.memo ?? "",
      sortOrder: 0,
      scope: "private",
    };
    setEvents((prev) => {
      const next = assignSortOrders([...prev, event]);
      const toSave = next.find((e) => e.id === event.id) ?? event;
      void persistEvent(toSave);
      return next;
    });
  }, [persistEvent]);

  const updateEvent = useCallback((
    id: string,
    patch: { title: string; startTime: string; endTime?: string | null; memo?: string },
  ): Promise<boolean> => {
    let updated: AppEvent | undefined;
    setEvents((prev) => {
      const next = prev.map((e) => {
        if (e.id !== id) return e;
        return {
          ...e,
          title: patch.title.trim(),
          startTime: patch.startTime,
          endTime: patch.endTime ?? null,
          memo: patch.memo ?? "",
        };
      });
      updated = next.find((e) => e.id === id);
      return next;
    });
    if (!updated) return Promise.resolve(false);
    return persistEvent(updated);
  }, [persistEvent]);

  const deleteEvent = useCallback((id: string) => {
    clearDraft("event", id);
    setEvents((prev) => prev.filter((e) => e.id !== id));
    void deleteEventDb(getSupabase(), id);
  }, [getSupabase]);

  const replaceEvents = useCallback((updater: (prev: AppEvent[]) => AppEvent[]) => {
    setEvents((prev) => {
      const next = assignSortOrders(updater(prev));
      void persistEvents(next);
      return next;
    });
  }, [persistEvents]);

  return {
    user,
    authReady,
    dataReady,
    loadError,
    events,
    addEvent,
    updateEvent,
    deleteEvent,
    replaceEvents,
    reload: () => {
      const uid = userIdRef.current;
      if (uid) return loadEvents(uid, { silent: true });
      return Promise.resolve(null);
    },
  };
}
