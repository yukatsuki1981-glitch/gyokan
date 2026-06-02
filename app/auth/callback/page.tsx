"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

function AuthCallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const supabase = createClient();
      const code = searchParams.get("code");
      const oauthError = searchParams.get("error");
      const oauthDescription = searchParams.get("error_description");

      if (oauthError) {
        const reason = oauthDescription?.includes("exchange")
          ? "google_exchange"
          : "oauth";
        router.replace(`/login?error=auth&reason=${reason}`);
        return;
      }

      if (!code) {
        router.replace("/login?error=auth&reason=no_code");
        return;
      }

      // Must run in the browser: PKCE code verifier lives in this tab's cookies.
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (cancelled) return;

      if (error) {
        console.error("[auth/callback] session exchange failed:", error.message);
        router.replace(
          `/login?error=auth&reason=session&detail=${encodeURIComponent(error.message)}`,
        );
        return;
      }

      router.replace("/");
      router.refresh();
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
      <p className="text-sm text-gray-500">ログイン処理中…</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#fafafa]">
          <p className="text-sm text-gray-500">ログイン処理中…</p>
        </div>
      }
    >
      <AuthCallbackHandler />
    </Suspense>
  );
}
