"use client";

import { useState } from "react";
import { AuthNotice, authPrimaryButtonClass } from "@/components/auth/auth-card";
import { EmailInput } from "@/components/auth/auth-fields";
import { useCooldown } from "@/components/auth/use-cooldown";
import { describeAuthError, looksLikeEmail } from "@/lib/auth-errors";
import { sendPasswordResetEmail } from "@/lib/supabase/password-reset";

/**
 * Shows the same result whether or not the address is registered. Only a failed
 * connection is reported: every other API error, including rate limits (which
 * can behave differently for registered addresses), could reveal registration.
 */
export function ForgotPasswordForm({
  email,
  onEmailChange,
}: {
  email: string;
  onEmailChange: (email: string) => void;
}) {
  const trimmedEmail = email.trim();
  const { remaining, start, cancel } = useCooldown(`reset:${trimmedEmail.toLowerCase()}`);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSent(false);
    if (!looksLikeEmail(trimmedEmail)) {
      setError("メールアドレスを入力してください。");
      return;
    }

    setSending(true);
    start();
    try {
      const { error: sendError } = await sendPasswordResetEmail(trimmedEmail);
      if (sendError) throw sendError;
      setSent(true);
    } catch (caught) {
      const { kind, message } = describeAuthError(caught);
      if (kind === "network") {
        cancel();
        setError(message);
      } else {
        setSent(true);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-3">
      {error && <AuthNotice tone="error">{error}</AuthNotice>}
      {sent && (
        <AuthNotice tone="success">
          再設定のメールの送信を受け付けました。届いていれば、メールをご確認ください。迷惑メールのフォルダもご確認ください。
        </AuthNotice>
      )}
      <EmailInput value={email} onChange={onEmailChange} />
      <button
        type="submit"
        disabled={sending || remaining > 0}
        className={authPrimaryButtonClass}
      >
        {sending
          ? "処理中…"
          : remaining > 0
            ? `もう一度送れるまで、あと${remaining}秒`
            : "再設定のメールを送る"}
      </button>
    </form>
  );
}
