"use client";

import { useState } from "react";
import { getAuthCallbackUrl } from "@/lib/auth-redirect";
import { describeAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";
import { useCooldown } from "@/components/auth/use-cooldown";

export function confirmationCooldownKey(email: string) {
  return `confirm:${email.toLowerCase()}`;
}

export function ResendConfirmationButton({ email }: { email: string }) {
  const { remaining, start, cancel } = useCooldown(confirmationCooldownKey(email));
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleResend = async () => {
    setSending(true);
    setResult(null);
    start();
    try {
      const { error } = await createClient().auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: getAuthCallbackUrl() },
      });
      if (error) throw error;
      setResult({ ok: true, message: "確認メールをもう一度送りました。" });
    } catch (error) {
      const { kind, message } = describeAuthError(error);
      // A failed connection sent nothing, so there is no reason to make them wait.
      if (kind === "network") cancel();
      setResult({ ok: false, message });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void handleResend()}
        disabled={sending || remaining > 0}
        className="min-h-11 w-full rounded-xl border border-black/[0.08] bg-white px-3 py-2.5 text-[13px] font-medium text-gray-800 transition-colors hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-white"
      >
        {sending
          ? "送信中…"
          : remaining > 0
            ? `もう一度送れるまで、あと${remaining}秒`
            : "メールが届かない場合は、もう一度送る"}
      </button>
      {result && (
        <p
          role={result.ok ? "status" : "alert"}
          className={`text-center text-[12px] leading-relaxed ${result.ok ? "text-emerald-700" : "text-red-600"}`}
        >
          {result.message}
        </p>
      )}
    </div>
  );
}
