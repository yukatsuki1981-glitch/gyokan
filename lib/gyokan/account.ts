import { createClient as createPlainClient, type User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export const PASSWORD_MIN_LENGTH = 8;

export type LoginMethod = "email" | "google" | string;

/** How this account signs in: "email", "google" (both when linked). */
export function loginMethodsOf(user: Pick<User, "app_metadata" | "identities"> | null | undefined): LoginMethod[] {
  if (!user) return [];
  const fromMeta = user.app_metadata?.providers;
  const list: string[] = Array.isArray(fromMeta)
    ? (fromMeta as unknown[]).filter((p): p is string => typeof p === "string")
    : [];
  if (list.length === 0 && typeof user.app_metadata?.provider === "string") list.push(user.app_metadata.provider);
  for (const identity of user.identities ?? []) {
    if (identity.provider && !list.includes(identity.provider)) list.push(identity.provider);
  }
  return list;
}

export function loginMethodLabel(method: LoginMethod): string {
  if (method === "email") return "メール";
  if (method === "google") return "Google";
  return method;
}

/**
 * Is `password` the current password of `email`? Checked on a throwaway
 * client that keeps nothing (no cookies, no storage), so the signed-in
 * session of the app is not touched; the extra session is signed out again.
 */
async function isCurrentPassword(email: string, password: string): Promise<boolean> {
  const checker = createPlainClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "gyokan-password-check",
    },
  });
  const { data, error } = await checker.auth.signInWithPassword({ email, password });
  if (data.session) await checker.auth.signOut({ scope: "local" }).catch(() => undefined);
  if (!error) return true;
  if (error.code === "invalid_credentials" || /invalid login credentials/i.test(error.message)) return false;
  throw error;
}

function friendlyAuthError(error: unknown): string {
  const { code, message, status } = (error ?? {}) as { code?: string; message?: string; status?: number };
  const text = message ?? "";
  if (code === "same_password" || /different from the old password/i.test(text)) {
    return "今と同じパスワードには、変えられません。別のパスワードにしてください。";
  }
  if (code === "weak_password" || /password should/i.test(text)) {
    return "このパスワードは、かんたんすぎるため使えません。英字と数字をまぜるなど、別のパスワードにしてください。";
  }
  if (code === "reauthentication_needed" || code === "reauth_nonce_missing") {
    return "安全のため、いったんログアウトして、もう一度ログインしてから、変えてください。";
  }
  if (status === 429 || code === "over_request_rate_limit" || code === "over_email_send_rate_limit") {
    return "続けて試したため、少しのあいだ変えられません。しばらく待ってから、もう一度ためしてください。";
  }
  if (/fetch|network/i.test(text)) {
    return "通信できませんでした。インターネットにつながっているか確かめて、もう一度ためしてください。";
  }
  return "パスワードを変えられませんでした。時間をおいて、もう一度ためしてください。";
}

export type PasswordChangeResult = { ok: true } | { ok: false; message: string };

export async function changePassword(params: {
  email: string;
  currentPassword: string;
  newPassword: string;
}): Promise<PasswordChangeResult> {
  const { email, currentPassword, newPassword } = params;
  try {
    if (!(await isCurrentPassword(email, currentPassword))) {
      return { ok: false, message: "今のパスワードが、ちがいます。もう一度、入力してください。" };
    }
    const { error } = await createClient().auth.updateUser({
      password: newPassword,
      current_password: currentPassword,
    });
    if (error) return { ok: false, message: friendlyAuthError(error) };
    return { ok: true };
  } catch (err) {
    return { ok: false, message: friendlyAuthError(err) };
  }
}
