import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_ONLY_COOKIE } from "@/lib/supabase/session-only";

/**
 * 退会 (account deletion), the app side. The work itself is done by the
 * database function public.delete_my_account() (migration
 * 20261129_account_deletion.sql); this file only calls it and cleans up this
 * device afterwards.
 */

/** The word to type in the confirmation box. */
export const DELETE_CONFIRM_WORD = "退会";

/** Query parameter for the login screen: show 「退会が完了しました」 once. */
export const ACCOUNT_DELETED_PARAM = "deleted";

/**
 * Is `input` the confirmation word? Spaces around it (half- or full-width)
 * are ignored, and full-/half-width forms are treated alike (NFKC).
 */
export function isDeleteConfirmed(input: string): boolean {
  return input.normalize("NFKC").trim() === DELETE_CONFIRM_WORD;
}

export type DeleteAccountResult =
  | { ok: true }
  /** The database has no delete_my_account() yet (migration not run). */
  | { ok: false; reason: "unavailable" }
  | { ok: false; reason: "failed" };

function isMissingFunctionError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return error.code === "PGRST202" || error.code === "42883" || message.includes("Could not find the function");
}

/** Calls public.delete_my_account(). The error itself goes to the console only. */
export async function deleteMyAccount(supabase: SupabaseClient): Promise<DeleteAccountResult> {
  try {
    const { error } = await supabase.rpc("delete_my_account");
    if (!error) return { ok: true };
    console.error("[account-deletion] delete_my_account failed:", error);
    return { ok: false, reason: isMissingFunctionError(error) ? "unavailable" : "failed" };
  } catch (err) {
    console.error("[account-deletion] delete_my_account failed:", err);
    return { ok: false, reason: "failed" };
  }
}

/**
 * Everything this app keeps on the device:
 *   localStorage / sessionStorage — every key starting with "gyokan"
 *     (gyokan-theme, gyokan-display-settings:…, gyokan-app-title:…,
 *     gyokan-mode-preferences:…, gyokan-draft-v1:…, gyokan-pending-daily-memos-v1,
 *     gyokan-pending-daily-diaries-v1, gyokan-pending-invite,
 *     gyokan-task-completed-at-v1, gyokan_story_v1, gyokan-password-reset…,
 *     gyokan-password-recovery, and the old gyokan-tasks-v5 / gyokan-cases-v6 /
 *     gyokan-project-memos-v1 / gyokan-project-colors-v1/v2) and every Supabase
 *     key ("sb-…");
 *   cookies — the Supabase sign-in cookies ("sb-…") and gyokan-session-only;
 *   Cache Storage — any cache of this site (the app makes none today).
 * Safe to call more than once; never throws.
 */
export async function clearAppDeviceData(): Promise<void> {
  const isAppKey = (key: string) => key.startsWith("gyokan") || key.startsWith("sb-");
  for (const storage of [safeStorage("localStorage"), safeStorage("sessionStorage")]) {
    if (!storage) continue;
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (key && isAppKey(key)) keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
    } catch {
      // Storage blocked (private mode etc.): nothing to clear.
    }
  }

  try {
    for (const pair of document.cookie.split(";")) {
      const name = pair.split("=")[0]?.trim();
      if (!name || !(name.startsWith("sb-") || name === SESSION_ONLY_COOKIE)) continue;
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`;
    }
  } catch {
    // No cookies to clear.
  }

  try {
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    // Cache Storage not available.
  }
}

function safeStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}
