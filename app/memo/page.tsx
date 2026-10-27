"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GyokanThemeProvider } from "@/components/gyokan-theme-provider";
import { ThemeDecorationLayer } from "@/components/theme-decoration-layer";
import { MemoModeView } from "@/components/memo/memo-mode-view";
import { DiaryMobileNav } from "@/components/diary/diary-mobile-nav";
import { isGyokanPaidMember } from "@/lib/gyokan/membership";
import { useGyokanData } from "@/lib/gyokan/use-gyokan-data";

const loading = (
  <div className="flex min-h-screen items-center justify-center bg-[var(--gyokan-bg)] text-[13px] text-gray-400">
    読み込み中…
  </div>
);

/** 「全てのメモを見る」: daily memos and project memos, day by day (same layout as /diary). */
function MemoPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") ?? undefined;

  const { user, authReady, authChecked, dataReady, dailyMemos, memos } = useGyokanData();

  const isPaidMember = isGyokanPaidMember(user);

  useEffect(() => {
    if (!authReady || !authChecked) return;
    if (!user) {
      router.replace("/login");
    }
  }, [authReady, authChecked, user, router]);

  if (!authReady || !authChecked || !user || !dataReady) return loading;

  return (
    <GyokanThemeProvider isPaidMember={isPaidMember}>
      <div className="gyokan-app relative min-h-screen text-[var(--gyokan-text)] antialiased">
        <div className="pointer-events-none fixed inset-0 z-0 bg-[var(--gyokan-bg)]" aria-hidden />
        <ThemeDecorationLayer />
        <div className="relative z-[2] mx-auto max-w-6xl px-3 py-4 pb-24 sm:px-6 lg:py-6">
          <MemoModeView dailyMemos={dailyMemos} projectMemos={memos} initialDate={dateParam} />
        </div>
        <DiaryMobileNav current="memo" />
      </div>
    </GyokanThemeProvider>
  );
}

export default function MemoPage() {
  return (
    <Suspense fallback={loading}>
      <MemoPageContent />
    </Suspense>
  );
}
