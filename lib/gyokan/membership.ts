import type { User } from "@supabase/supabase-js";

function readPaidFlag(meta: Record<string, unknown> | undefined): boolean {
  if (!meta) return false;
  if (meta.paid_member === true) return true;
  if (meta.plan === "paid") return true;
  if (meta.membership === "paid") return true;
  return false;
}

/** 有料会員かどうか（Supabase の app_metadata / user_metadata を参照） */
export function isGyokanPaidMember(user: User | null | undefined): boolean {
  if (!user) return false;
  if (readPaidFlag(user.app_metadata as Record<string, unknown> | undefined)) {
    return true;
  }
  return readPaidFlag(user.user_metadata as Record<string, unknown> | undefined);
}
