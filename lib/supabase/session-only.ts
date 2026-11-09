/**
 * 「ログイン状態を保持する」を OFF にしてログインしたことを示す目印のクッキー。
 * 目印自体も期限なしのセッションクッキーなので、認証クッキーと一緒に消える。
 *
 * Supabase は認証クッキーを書くたびに 400 日の期限を付ける。トークン更新の書き込みは
 * ブラウザ（client.ts）とサーバー（middleware.ts）の両方で起きるので、どちらでも
 * この目印を見て期限を外す。片方でも忘れると、更新のタイミングで「保持」に戻ってしまう。
 */
export const SESSION_ONLY_COOKIE = "gyokan-session-only";

/** Drops the lifetime so the browser treats it as a session cookie. Deletions (maxAge 0) are left alone. */
export function toSessionCookieOptions<T extends { maxAge?: number; expires?: Date }>(options: T): T {
  if (options.maxAge === 0) return options;
  const rest = { ...options };
  delete rest.maxAge;
  delete rest.expires;
  return rest;
}
