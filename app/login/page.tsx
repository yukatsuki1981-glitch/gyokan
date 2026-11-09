"use client";

import { createClient, resetBrowserClient } from "@/lib/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { describeAuthError } from "@/lib/auth-errors";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const authError = searchParams.get("error") === "auth";
  const authReason = searchParams.get("reason");
  const authDetail = searchParams.get("detail");
  const [checking, setChecking] = useState(true);
  const [existingSession, setExistingSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formMessage, setFormMessage] = useState<string | null>(null);
  const signingInRef = useRef(false);

  const errorMessage = (() => {
    if (!authError) return null;
    if (authReason === "link_expired") {
      return "メールのリンクの有効期限が切れているか、すでに使われています。ログインすると、確認メールを送り直せます。";
    }
    if (authReason === "link_other_browser") {
      return "登録したときと別のブラウザでリンクを開いたため、自動でログインできませんでした。メールとパスワードでログインしてください。";
    }
    if (authReason === "session") {
      return "ログインを完了できませんでした。もう一度お試しください。";
    }
    return "Google でログインできませんでした。もう一度お試しください。";
  })();

  useEffect(() => {
    if (authError) {
      console.error("[login] auth error:", authReason, authDetail ?? "");
    }
  }, [authError, authReason, authDetail]);

  useEffect(() => {
    const supabase = createClient();

    const finishCheck = (session: Session | null) => {
      setExistingSession(session);
      setChecking(false);
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      finishCheck(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (signingInRef.current && session?.user) {
        window.location.href = "/";
        return;
      }
      setExistingSession(session);
      setChecking(false);
    });

    const fallback = window.setTimeout(() => setChecking(false), 5000);
    return () => {
      window.clearTimeout(fallback);
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    setSubmitting(true);
    setFormError(null);
    try {
      const supabase = createClient();
      await supabase.auth.signOut({ scope: "global" });
      resetBrowserClient();
      setExistingSession(null);
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const redirectAfterAuth = () => {
    signingInRef.current = true;
    window.location.href = "/";
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormMessage(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setFormError("メールアドレスとパスワードを入力してください。");
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        if (!data.session) {
          setFormError("うまくいきませんでした。もう一度お試しください。");
          return;
        }
        redirectAfterAuth();
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: trimmedEmail,
        password,
      });
      if (error) throw error;
      if (data.session) {
        redirectAfterAuth();
        return;
      }
      setFormMessage(
        "確認メールを送信しました。メール内のリンクから登録を完了してください。",
      );
    } catch (error) {
      setFormError(describeAuthError(error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
        <div className="h-7 w-7 animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#fafafa] px-6">
      <div className="w-full max-w-sm rounded-2xl border border-black/[0.06] bg-white p-8 shadow-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-[#007AFF] text-lg font-bold text-white shadow-sm">
            行
          </div>
          <h1 className="text-xl font-semibold text-gray-900">行間</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-gray-500">
            タスク・案件管理
          </p>
        </div>
        {existingSession?.user && (
          <div className="mb-4 space-y-3 rounded-xl bg-amber-50 px-3 py-3 text-[13px] text-amber-900">
            <p className="leading-relaxed">
              <span className="font-medium">{existingSession.user.email}</span>
              {" "}でログイン中です。別のアカウント（メールログインなど）を使う場合は、一度ログアウトしてください。
            </p>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={submitting}
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-[13px] font-medium text-amber-900 transition-colors hover:bg-amber-100/60 disabled:opacity-60"
            >
              ログアウトして別アカウントでログイン
            </button>
          </div>
        )}
        {errorMessage && (
          <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-[13px] leading-relaxed text-red-600">
            {errorMessage}
          </div>
        )}
        {formError && (
          <div className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-center text-[13px] text-red-600">
            {formError}
          </div>
        )}
        {formMessage && (
          <div className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-center text-[13px] leading-relaxed text-emerald-700">
            {formMessage}
          </div>
        )}
        <form onSubmit={handleEmailAuth} className="mb-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-500">
              メールアドレス
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
              placeholder="name@example.com"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[12px] font-medium text-gray-500">
              パスワード
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className="w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-[14px] outline-none transition-colors focus:border-blue-200 focus:ring-2 focus:ring-blue-50"
              placeholder="8文字以上"
              minLength={8}
            />
          </label>
          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-[#007AFF] px-4 py-3 text-[14px] font-medium text-white transition-colors hover:bg-[#0066d6] disabled:opacity-60"
          >
            {submitting
              ? "処理中…"
              : mode === "login"
                ? "メールでログイン"
                : "アカウントを作成"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "signup" : "login"));
            setFormError(null);
            setFormMessage(null);
          }}
          className="mb-4 w-full text-center text-[12px] text-gray-500 transition-colors hover:text-[#007AFF]"
        >
          {mode === "login"
            ? "アカウントをお持ちでない方はこちら"
            : "すでにアカウントをお持ちの方はこちら"}
        </button>
        <div className="mb-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-black/[0.06]" />
          <span className="text-[11px] text-gray-400">または</span>
          <div className="h-px flex-1 bg-black/[0.06]" />
        </div>
        <a
          href="/auth/login/google"
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-black/[0.08] bg-white px-4 py-3 text-[14px] font-medium text-gray-800 transition-colors hover:bg-gray-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Google でログイン
        </a>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
