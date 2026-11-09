"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createHouseholdInvite,
  ensureMyHousehold,
  fetchHouseholdMemberLimit,
  fetchHouseholdMembers,
  householdErrorMessage,
  inviteUrl,
  saveMyDisplayName,
  type HouseholdMember,
} from "./household";

/**
 * The signed-in user's household for the settings screen: its members (with
 * display names), the member limit, my display name, and invite creation.
 * Loads when `userId` is set; the caller passes the id it already has from
 * its own onAuthStateChange-based session (no getSession here).
 */
export function useHousehold(userId: string | null | undefined) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [memberLimit, setMemberLimit] = useState<number | null>(null);
  // True until the first load finishes (a reload keeps showing the current data).
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await ensureMyHousehold(supabase);
      const [list, limit] = await Promise.all([
        fetchHouseholdMembers(supabase, userId),
        fetchHouseholdMemberLimit(supabase),
      ]);
      setMembers(list);
      setMemberLimit(limit);
      setError(null);
    } catch (err) {
      setError(householdErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const myDisplayName = members.find((m) => m.isMe)?.displayName ?? null;

  const saveDisplayName = useCallback(
    async (name: string): Promise<boolean> => {
      if (!userId) return false;
      try {
        await saveMyDisplayName(createClient(), userId, name);
        setError(null);
        await load();
        return true;
      } catch (err) {
        setError(`表示名を保存できませんでした: ${householdErrorMessage(err)}`);
        return false;
      }
    },
    [userId, load],
  );

  /** Returns the invite link, or null (with `error` set) when it couldn't be created. */
  const createInviteLink = useCallback(async (): Promise<string | null> => {
    try {
      const token = await createHouseholdInvite(createClient());
      setError(null);
      return inviteUrl(token);
    } catch (err) {
      setError(householdErrorMessage(err));
      return null;
    }
  }, []);

  const isFull = memberLimit != null && members.length >= memberLimit;

  return { members, memberLimit, isFull, myDisplayName, loading, error, reload: load, saveDisplayName, createInviteLink };
}
