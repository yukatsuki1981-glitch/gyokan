import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sharing private-mode events with family: households, invites and display
 * names (migration 20261013_households.sql). Every change goes through the
 * database functions there — the tables themselves are read-only or hidden
 * to clients by RLS.
 */

export type HouseholdMember = {
  userId: string;
  displayName: string | null;
  isMe: boolean;
};

export type InviteCheckStatus =
  | "ok"
  | "invalid"
  // Added with migration 20261122_invite_expiry.sql. A database without that
  // migration never returns it; the invite page shows anything it has no
  // message for as a generic "can't join".
  | "expired"
  | "already_member"
  | "full"
  | "in_other_shared_household"
  | "not_authenticated";

export const DISPLAY_NAME_MAX = 20;

export const INVITE_INVALID_MESSAGE =
  "この招待リンクは使えません。取り消されたか、すでに使われています。招待した人に、新しいリンクを作ってもらってください。";
export const INVITE_EXPIRED_MESSAGE =
  "この招待リンクは、有効期限(7日間)が過ぎています。招待した人に、新しいリンクを作ってもらってください。";

/** active = まだ使える / used = 使用済み / expired = 期限切れ / revoked = 取り消し済み */
export type HouseholdInviteStatus = "active" | "used" | "expired" | "revoked";

export type HouseholdInvite = {
  id: string;
  createdAt: string;
  expiresAt: string;
  status: HouseholdInviteStatus;
  createdByMe: boolean;
};

export const INVITE_STATUS_LABELS: Record<HouseholdInviteStatus, string> = {
  active: "使用中",
  used: "使用済み",
  expired: "期限切れ",
  revoked: "取り消し済み",
};

/** What to call a member on screen; never their e-mail address. */
export function memberLabel(member: Pick<HouseholdMember, "displayName" | "isMe">) {
  if (member.isMe) return "自分";
  return member.displayName?.trim() || "家族";
}

/** Turns a database error from the household functions into a message for the screen. */
export function householdErrorMessage(err: unknown): string {
  const raw =
    err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : String(err);
  if (raw.includes("invalid_invite")) return INVITE_INVALID_MESSAGE;
  if (raw.includes("invite_expired")) return INVITE_EXPIRED_MESSAGE;
  if (raw.includes("already_member")) return "すでにこの家族の共有に参加しています。";
  if (raw.includes("household_full")) return "この家族の共有は、すでに上限の人数に達しています。";
  if (raw.includes("in_other_shared_household")) return "すでに別の家族と予定を共有しているため、参加できません。";
  if (raw.includes("confirmation_required")) return "予定が共有されることへの確認が必要です。";
  if (raw.includes("not_authenticated")) return "ログインしてから、もう一度お試しください。";
  if (raw.includes("Could not find the function") || raw.includes("PGRST202")) {
    return "共有の機能を使う準備ができていません(データベースの更新が必要です)。";
  }
  return raw || "処理に失敗しました。";
}

export async function ensureMyHousehold(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("ensure_my_household");
  if (error) throw error;
  return data as string;
}

export async function fetchHouseholdMemberLimit(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc("household_member_limit");
  if (error) throw error;
  return Number(data);
}

/** The members of my household (RLS returns only my own household's rows), with display names. */
export async function fetchHouseholdMembers(
  supabase: SupabaseClient,
  myUserId: string,
): Promise<HouseholdMember[]> {
  const members = await supabase.from("household_members").select("user_id, joined_at").order("joined_at");
  if (members.error) throw members.error;
  const ids = ((members.data ?? []) as { user_id: string }[]).map((m) => m.user_id);
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const profiles = await supabase.from("profiles").select("user_id, display_name").in("user_id", ids);
    if (profiles.error) throw profiles.error;
    for (const p of (profiles.data ?? []) as { user_id: string; display_name: string | null }[]) {
      names.set(p.user_id, p.display_name);
    }
  }
  return ids
    .map((id) => ({ userId: id, displayName: names.get(id) ?? null, isMe: id === myUserId }))
    // Me first, then the others in join order.
    .sort((a, b) => Number(b.isMe) - Number(a.isMe));
}

export async function fetchMyDisplayName(supabase: SupabaseClient, myUserId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", myUserId)
    .maybeSingle();
  if (error) throw error;
  return (data as { display_name: string | null } | null)?.display_name ?? null;
}

/** Saves (or clears, for an empty name) my display name. */
export async function saveMyDisplayName(supabase: SupabaseClient, myUserId: string, name: string) {
  const trimmed = name.trim().slice(0, DISPLAY_NAME_MAX);
  const { error } = await supabase
    .from("profiles")
    .upsert({ user_id: myUserId, display_name: trimmed || null });
  if (error) throw error;
}

/** Creates a single-use invite and returns its token (shown once). */
export async function createHouseholdInvite(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc("create_household_invite");
  if (error) throw error;
  return data as string;
}

/** True for "this database function doesn't exist (yet)" — the migration hasn't been run. */
function isMissingFunctionError(err: unknown) {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? e.message : "";
  return code === "PGRST202" || code === "42883" || message.includes("Could not find the function");
}

const INVITE_STATUSES: readonly string[] = ["active", "used", "expired", "revoked"];

/**
 * The invites of my household, newest first, without the links themselves.
 * Returns null when the database doesn't have the invite list yet (migration
 * 20261122_invite_expiry.sql not run) — the screen then leaves the list out,
 * as before.
 */
export async function fetchHouseholdInvites(supabase: SupabaseClient): Promise<HouseholdInvite[] | null> {
  const { data, error } = await supabase.rpc("list_household_invites");
  if (error) {
    if (isMissingFunctionError(error)) return null;
    throw error;
  }
  type Row = { id: string; created_at: string; expires_at: string; status: string; created_by_me: boolean };
  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    // An unknown status (a newer database) is shown as not usable.
    status: INVITE_STATUSES.includes(row.status) ? (row.status as HouseholdInviteStatus) : "revoked",
    createdByMe: !!row.created_by_me,
  }));
}

/** Revokes an unused invite of my household. False when it was already used or revoked. */
export async function revokeHouseholdInvite(supabase: SupabaseClient, inviteId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("revoke_household_invite", { p_invite_id: inviteId });
  if (error) throw error;
  return data === true;
}

export function inviteUrl(token: string) {
  return `${window.location.origin}/invite/${token}`;
}

/** Whether an invite can be used by me — reveals nothing about the inviting household. */
export async function checkHouseholdInvite(
  supabase: SupabaseClient,
  token: string,
): Promise<{ status: InviteCheckStatus; myEventCount: number }> {
  const { data, error } = await supabase.rpc("check_household_invite", { p_token: token });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { status: InviteCheckStatus; my_event_count: number } | null;
  return { status: row?.status ?? "invalid", myEventCount: row?.my_event_count ?? 0 };
}

/** Joins the inviting household. Only call after the user confirmed their events will be shared. */
export async function acceptHouseholdInvite(supabase: SupabaseClient, token: string): Promise<string> {
  const { data, error } = await supabase.rpc("accept_household_invite", {
    p_token: token,
    p_share_existing_events: true,
  });
  if (error) throw error;
  return data as string;
}

// An invite opened while signed out is remembered here, so that after signing
// in — including via Google or a sign-up confirmation e-mail, which come back
// to "/" — the app can send the user back to it.
const PENDING_INVITE_KEY = "gyokan-pending-invite";
const PENDING_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function savePendingInvite(token: string) {
  try {
    localStorage.setItem(PENDING_INVITE_KEY, JSON.stringify({ token, savedAt: Date.now() }));
  } catch {
    /* ignore */
  }
}

export function readPendingInvite(): string | null {
  try {
    const raw = localStorage.getItem(PENDING_INVITE_KEY);
    if (!raw) return null;
    const { token, savedAt } = JSON.parse(raw) as { token?: string; savedAt?: number };
    if (!token || !savedAt || Date.now() - savedAt > PENDING_INVITE_TTL_MS) {
      localStorage.removeItem(PENDING_INVITE_KEY);
      return null;
    }
    return token;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* ignore */
  }
}
