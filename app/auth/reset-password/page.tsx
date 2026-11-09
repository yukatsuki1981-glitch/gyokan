"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthCard, AuthNotice, authPrimaryButtonClass, authTextLinkClass } from "@/components/auth/auth-card";
import { PasswordInput } from "@/components/auth/auth-fields";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { describeAuthError, MIN_PASSWORD_LENGTH } from "@/lib/auth-errors";
import { createClient, setSessionOnlyLogin } from "@/lib/supabase/client";

/** Lets a reload keep the form open: the link's tokens are removed from the URL once read. */
const RECOVERY_FLAG = "gyokan-password-recovery";

function hasRecoveryFlag() {
  try {
    return window.sessionStorage.getItem(RECOVERY_FLAG) === "1";
  } catch {
    return false;
  }
}

function setRecoveryFlag(on: boolean) {
  try {
    if (on) window.sessionStorage.setItem(RECOVERY_FLAG, "1");
    else window.sessionStorage.removeItem(RECOVERY_FLAG);
  } catch {
    // Without storage, a reload just asks them to request a new link.
  }
}

type Stage = "checking" | "form" | "invalid" | "done";

export default function ResetPasswordPage() {
  const [stage, setStage] = useState<Stage>("checking");
  const [accountEmail, setAccountEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    // Strict Mode runs effects twice, and the tokens are gone from the URL after the first.
    if (startedRef.current) return;
    startedRef.current = true;

    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    const isRecovery = hash.get("type") === "recovery";

    const linkError = hash.get("error_code") ?? hash.get("error");
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    if (linkError) {
      console.error("[auth/reset-password] link error:", linkError, hash.get("error_description"));
    }

    if (!accessToken || !refreshToken || !isRecovery) {
      void Promise.resolve().then(() => setStage(!linkError && hasRecoveryFlag() ? "form" : "invalid"));
      return;
    }

    void (async () => {
      try {
        // A password reset keeps the login, like Google and email confirmation.
        setSessionOnlyLogin(false);
        const { data, error: sessionError } = await createClient().auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (sessionError) throw sessionError;
        setAccountEmail(data.user?.email ?? "");
        setRecoveryFlag(true);
        setStage("form");
      } catch (caught) {
        const { kind, message } = describeAuthError(caught);
        console.error("[auth/reset-password] could not open the link:", kind, message);
        setStage("invalid");
      }
    })();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードが短すぎます。${MIN_PASSWORD_LENGTH}文字以上で入力してください。`);
      return;
    }
    if (password !== confirmation) {
      setError("2つのパスワードが一致していません。もう一度ご確認ください。");
      return;
    }

    setSubmitting(true);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      setRecoveryFlag(false);
      setStage("done");
      window.setTimeout(() => {
        window.location.href = "/";
      }, 1500);
    } catch (caught) {
      const { kind, message } = describeAuthError(caught);
      if (kind === "session_missing") {
        setRecoveryFlag(false);
        setStage("invalid");
      } else {
        setError(message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (stage === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }

  if (stage === "invalid") {
    return (
      <AuthCard subtitle="パスワードの再設定">
        <p className="mb-4 text-center text-[13px] leading-relaxed text-gray-600">
          このリンクは有効期限が切れているか、すでに使われているようです。お手数ですが、もう一度メールを送ってください。
        </p>
        <ForgotPasswordForm email={resendEmail} onEmailChange={setResendEmail} />
        <Link href="/login" className={`${authTextLinkClass} mt-4 block`}>
          ログイン画面に戻る
        </Link>
      </AuthCard>
    );
  }

  if (stage === "done") {
    return (
      <AuthCard subtitle="パスワードの再設定">
        <AuthNotice tone="success">パスワードを変更しました。ホームに移動します…</AuthNotice>
      </AuthCard>
    );
  }

  return (
    <AuthCard subtitle="新しいパスワードを設定してください">
      {error && <AuthNotice tone="error">{error}</AuthNotice>}
      <form onSubmit={handleSubmit} noValidate className="space-y-3">
        {/* Tells password managers which account this new password belongs to. */}
        {accountEmail && (
          <input type="email" name="email" value={accountEmail} autoComplete="username" readOnly hidden />
        )}
        <PasswordInput
          label="新しいパスワード"
          name="new-password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          placeholder={`${MIN_PASSWORD_LENGTH}文字以上`}
        />
        <PasswordInput
          label="新しいパスワード（確認）"
          name="confirm-password"
          value={confirmation}
          onChange={setConfirmation}
          autoComplete="new-password"
          placeholder="もう一度入力"
        />
        <button type="submit" disabled={submitting} className={authPrimaryButtonClass}>
          {submitting ? "処理中…" : "パスワードを変更する"}
        </button>
      </form>
    </AuthCard>
  );
}
