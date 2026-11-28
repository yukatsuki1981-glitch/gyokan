"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  createHouseholdInvite,
  ensureMyHousehold,
  fetchHouseholdInvites,
  fetchHouseholdMemberLimit,
  fetchHouseholdMembers,
  fetchMemberRemoveInfo,
  householdErrorMessage,
  inviteUrl,
  leaveHousehold,
  removeHouseholdMember,
  removeMemberErrorCode,
  revokeHouseholdInvite,
  saveMyDisplayName,
  type HouseholdInvite,
  type HouseholdMember,
  type MemberRemoveInfo,
  type RemoveMemberErrorCode,
} from "./household";

export type RemoveMemberResult = { ok: true } | { ok: false; code: RemoveMemberErrorCode };

/**
 * The signed-in user's household for the settings screen: its members (with
 * display names), the member limit, my display name, invite creation, and the
 * list of invites (with revoking).
 * Loads when `userId` is set; the caller passes the id it already has from
 * its own onAuthStateChange-based session (no getSession here).
 */
export function useHousehold(userId: string | null | undefined) {
  const [members, setMembers] = useState<HouseholdMember[]>([]);
  const [memberLimit, setMemberLimit] = useState<number | null>(null);
  // True once the member list has been loaded successfully: only then can
  // "not a member" mean "left the household" (以前のメンバー).
  const [membersLoaded, setMembersLoaded] = useState(false);
  // null = this database has no invite list yet (migration not run): the
  // screen leaves the list out instead of showing an error.
  const [invites, setInvites] = useState<HouseholdInvite[] | null>(null);
  // Who may remove members (get_member_remove_info). null = not known: not
  // loaded yet, failed, or the database has no such function — then nobody
  // gets a 「外す」 button.
  const [removeInfo, setRemoveInfo] = useState<MemberRemoveInfo | null>(null);
  // True until the first load finishes (a reload keeps showing the current data).
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    try {
      setInvites(await fetchHouseholdInvites(createClient()));
    } catch (err) {
      setError(`招待の一覧を読み込めませんでした: ${householdErrorMessage(err)}`);
    }
  }, []);

  const load = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    try {
      await ensureMyHousehold(supabase);
      const [list, limit, info] = await Promise.all([
        fetchHouseholdMembers(supabase, userId),
        fetchHouseholdMemberLimit(supabase),
        // A failure here only hides 「外す」; the members are still shown.
        fetchMemberRemoveInfo(supabase).catch((err: unknown) => {
          console.error("[household] get_member_remove_info:", err);
          return null;
        }),
      ]);
      setMembers(list);
      setMemberLimit(limit);
      setRemoveInfo(info);
      setMembersLoaded(true);
      setError(null);
    } catch (err) {
      setError(householdErrorMessage(err));
    } finally {
      setLoading(false);
    }
    // After the household exists; failures here don't hide the members.
    await loadInvites();
  }, [userId, loadInvites]);

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

  /**
   * Returns the invite link, or null (with `error` set) when it couldn't be
   * created. Creating one also revokes the earlier unused links (done by the
   * database), so the list is reloaded.
   */
  const createInviteLink = useCallback(async (): Promise<string | null> => {
    try {
      const token = await createHouseholdInvite(createClient());
      setError(null);
      void loadInvites();
      return inviteUrl(token);
    } catch (err) {
      setError(householdErrorMessage(err));
      return null;
    }
  }, [loadInvites]);

  /** Revokes an unused invite; the list is reloaded either way. */
  const revokeInvite = useCallback(
    async (inviteId: string): Promise<boolean> => {
      try {
        const revoked = await revokeHouseholdInvite(createClient(), inviteId);
        setError(revoked ? null : "この招待は、すでに使われたか、取り消されています。");
        await loadInvites();
        return revoked;
      } catch (err) {
        setError(`招待を取り消せませんでした: ${householdErrorMessage(err)}`);
        return false;
      }
    },
    [loadInvites],
  );

  /** 「共有をやめる」. True when I left; false (with `error` set) otherwise. */
  const leave = useCallback(async (): Promise<boolean> => {
    try {
      await leaveHousehold(createClient());
      setError(null);
      await load();
      return true;
    } catch (err) {
      setError(`共有をやめられませんでした: ${householdErrorMessage(err)}`);
      return false;
    }
  }, [load]);

  /**
   * 「外す」: removes another member. On success, and when the member list or
   * my permission was out of date (not_owner / not_a_member), the household is
   * reloaded. The error is also written to the console.
   */
  const removeMember = useCallback(
    async (memberUserId: string): Promise<RemoveMemberResult> => {
      try {
        await removeHouseholdMember(createClient(), memberUserId);
        await load();
        return { ok: true };
      } catch (err) {
        console.error("[household] remove_household_member:", err);
        const code = removeMemberErrorCode(err);
        if (code === "not_owner" || code === "not_a_member") void load();
        return { ok: false, code };
      }
    },
    [load],
  );

  const isFull = memberLimit != null && members.length >= memberLimit;
  /** How many more people can join (null until the limit is known). */
  const remainingSeats = memberLimit == null ? null : Math.max(0, memberLimit - members.length);
  /** Unused, still-valid invites of the household (0 when the list isn't available). */
  const activeInviteCount = invites?.filter((invite) => invite.status === "active").length ?? 0;

  return {
    members,
    membersLoaded,
    memberLimit,
    isFull,
    remainingSeats,
    activeInviteCount,
    myDisplayName,
    invites,
    loading,
    error,
    reload: load,
    saveDisplayName,
    createInviteLink,
    revokeInvite,
    leave,
    removeInfo,
    removeMember,
  };
}
