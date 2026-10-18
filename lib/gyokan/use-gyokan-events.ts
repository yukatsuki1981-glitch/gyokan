"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { newUuid } from "./mappers";
import {
  assignSortOrders,
  deleteEventDb,
  EVENT_GONE_MESSAGE,
  fetchGyokanEvents,
  isFamilyEvent,
  saveEventSortOrders,
  updateFamilyEvent,
  upsertEvent,
} from "./repository";
import {
  clearDraft,
  eventDraftDiffers,
  mergeEventsWithDrafts,
  readDraft,
  type EventDraftFields,
} from "./drafts";
import { applyEventDraft } from "./events";
import { itemsWithChangedSortOrder } from "./reorder";
import type { AppEvent, EventVisibility } from "./types";

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
  const [saveError, setSaveError] = useState<string | null>(null);
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
        if (isFamilyEvent(merged, uid)) await updateFamilyEvent(supabase, merged);
        else await upsertEvent(supabase, merged, uid);
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
      const rows = await fetchGyokanEvents(getSupabase());
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

  // Family members change shared events too: re-read whenever the app comes
  // back to the front (tab switched back, phone app resumed, page restored
  // from the back/forward cache). Opening the app afresh loads on mount.
  useEffect(() => {
    const reloadIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      const uid = userIdRef.current;
      if (uid && initialLoadDoneRef.current) void loadEvents(uid, { silent: true });
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) reloadIfVisible();
    };
    document.addEventListener("visibilitychange", reloadIfVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", reloadIfVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [loadEvents]);

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
      // A family member's event is updated, never upserted (an upsert would
      // re-create it as mine if they deleted it meanwhile).
      if (isFamilyEvent(event, uid)) await updateFamilyEvent(getSupabase(), event);
      else await upsertEvent(getSupabase(), event, uid);
      clearDraft("event", event.id);
      setSaveError(null);
      return true;
    } catch (err) {
      console.error("Failed to save event", err);
      setSaveError(formatLoadError(err));
      // Gone on the server: show the calendar as it really is.
      if (formatLoadError(err) === EVENT_GONE_MESSAGE) void loadEvents(uid, { silent: true });
      return false;
    }
  }, [getSupabase, loadEvents]);

  /** Saves the sort orders of the events whose position changed. */
  const persistSortOrders = useCallback(async (changed: AppEvent[]) => {
    const uid = userIdRef.current;
    if (!uid || changed.length === 0) return;
    try {
      await saveEventSortOrders(getSupabase(), changed, uid);
      setSaveError(null);
    } catch (err) {
      console.error("Failed to save events", err);
      setSaveError(formatLoadError(err));
    }
  }, [getSupabase]);

  const addEvent = useCallback((data: {
    title: string;
    startTime: string;
    endTime?: string | null;
    memo?: string;
    color?: string | null;
    visibility?: EventVisibility;
  }) => {
    const event: AppEvent = {
      id: newUuid(),
      title: data.title.trim(),
      startTime: data.startTime,
      endTime: data.endTime ?? null,
      memo: data.memo ?? "",
      sortOrder: 0,
      scope: "private",
      color: data.color ?? null,
      userId: userIdRef.current ?? undefined,
      visibility: data.visibility ?? "shared",
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
    patch: {
      title: string;
      startTime: string;
      endTime?: string | null;
      memo?: string;
      color?: string | null;
      /** Only the creator may change it; ignored for a family member's event. */
      visibility?: EventVisibility;
    },
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
          color: patch.color ?? null,
          visibility:
            patch.visibility && !isFamilyEvent(e, userIdRef.current ?? "") ? patch.visibility : e.visibility,
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
    deleteEventDb(getSupabase(), id).catch((err) => {
      console.error("Failed to delete event", err);
      setSaveError(formatLoadError(err));
    });
  }, [getSupabase]);

  const replaceEvents = useCallback((updater: (prev: AppEvent[]) => AppEvent[]) => {
    setEvents((prev) => {
      const next = assignSortOrders(updater(prev));
      void persistSortOrders(itemsWithChangedSortOrder(prev, next));
      return next;
    });
  }, [persistSortOrders]);

  return {
    user,
    authReady,
    dataReady,
    loadError,
    saveError,
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
