export const MIN_PASSWORD_LENGTH = 8;

export type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "already_registered"
  | "weak_password"
  | "same_password"
  | "invalid_email"
  | "session_missing"
  | "network"
  | "rate_limit"
  | "unknown";

const GENERIC_MESSAGE = "うまくいきませんでした。もう一度お試しください。";

const MESSAGES: Record<Exclude<AuthErrorKind, "weak_password" | "unknown">, string> = {
  invalid_credentials: "メールアドレスまたはパスワードが違います。",
  email_not_confirmed:
    "メールアドレスの確認がまだ完了していません。届いたメールのリンクを開いてください。",
  already_registered:
    "このメールアドレスはすでに登録されています。ログインをお試しください。",
  same_password: "今までと同じパスワードは使えません。別のパスワードを入力してください。",
  invalid_email: "メールアドレスの形式をご確認ください。",
  session_missing:
    "リンクの有効期限が切れたようです。もう一度、再設定のメールを送ってください。",
  network:
    "通信できませんでした。インターネットの接続をご確認のうえ、もう一度お試しください。",
  rate_limit: "リクエストが多すぎます。しばらく待ってから、もう一度お試しください。",
};

function classify(code: string, name: string, status: number | undefined, message: string): AuthErrorKind {
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "invalid_credentials";
  }
  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "email_not_confirmed";
  }
  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    /already (been )?(registered|exists)/i.test(message)
  ) {
    return "already_registered";
  }
  if (code === "same_password" || /different from the old password/i.test(message)) {
    return "same_password";
  }
  if (code === "weak_password" || /^password should/i.test(message)) {
    return "weak_password";
  }
  if (code === "email_address_invalid" || code === "validation_failed" || /email address.*invalid/i.test(message)) {
    return "invalid_email";
  }
  if (code === "session_not_found" || name === "AuthSessionMissingError" || /session missing/i.test(message)) {
    return "session_missing";
  }
  if (
    status === 429 ||
    code.startsWith("over_") ||
    /rate limit|too many|for security purposes/i.test(message)
  ) {
    return "rate_limit";
  }
  if (
    name === "AuthRetryableFetchError" ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)
  ) {
    return "network";
  }
  return "unknown";
}

function weakPasswordMessage(message: string): string {
  const minLength = message.match(/at least (\d+) characters/i)?.[1];
  if (minLength) {
    return `パスワードが短すぎます。${minLength}文字以上で入力してください。`;
  }
  if (/pwned|known to be weak|easy to guess/i.test(message)) {
    return "このパスワードは推測されやすいため使えません。別のパスワードを入力してください。";
  }
  return `このパスワードは使えません。${MIN_PASSWORD_LENGTH}文字以上で、英字と数字を組み合わせるなど、別のパスワードをお試しください。`;
}

/**
 * Turns anything thrown or returned by Supabase Auth into a friendly Japanese
 * message. The raw details of unexpected errors only ever go to the console.
 */
export function describeAuthError(error: unknown): { kind: AuthErrorKind; message: string } {
  const source = (error ?? {}) as { code?: unknown; name?: unknown; status?: unknown; message?: unknown };
  const code = typeof source.code === "string" ? source.code : "";
  const name = typeof source.name === "string" ? source.name : "";
  const status = typeof source.status === "number" ? source.status : undefined;
  const message = typeof source.message === "string" ? source.message : "";

  const kind = classify(code, name, status, message);
  if (kind === "unknown") {
    console.error("[auth] unexpected error:", error);
    return { kind, message: GENERIC_MESSAGE };
  }
  if (kind === "weak_password") {
    return { kind, message: weakPasswordMessage(message) };
  }
  return { kind, message: MESSAGES[kind] };
}

export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value);
}
