"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GyokanThemeProvider } from "@/components/gyokan-theme-provider";
import { ThemeDecorationLayer } from "@/components/theme-decoration-layer";
import { DiaryModeView } from "@/components/diary/diary-mode-view";
import { DiaryMobileNav } from "@/components/diary/diary-mobile-nav";
import { isGyokanPaidMember } from "@/lib/gyokan/membership";
import { useGyokanData } from "@/lib/gyokan/use-gyokan-data";

function DiaryPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date") ?? undefined;

  const {
    user,
    authReady,
    authChecked,
    dailyDiaries,
    saveJournalEntry,
  } = useGyokanData();

  const isPaidMember = isGyokanPaidMember(user);

  useEffect(() => {
    if (!authReady || !authChecked) return;
    if (!user) {
      router.replace("/login");
    }
  }, [authReady, authChecked, user, router]);

  if (!authReady || !authChecked || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--gyokan-bg)] text-[13px] text-gray-400">
        読み込み中…
      </div>
    );
  }

  return (
    <GyokanThemeProvider isPaidMember={isPaidMember}>
      <div className="gyokan-app relative min-h-screen text-[var(--gyokan-text)] antialiased">
        <div
          className="pointer-events-none fixed inset-0 z-0 bg-[var(--gyokan-bg)]"
          aria-hidden
        />
        <ThemeDecorationLayer />
        <div className="relative z-[2] mx-auto max-w-6xl px-3 py-4 pb-24 sm:px-6 lg:py-6">
          <DiaryModeView
            diaries={dailyDiaries}
            onSave={saveJournalEntry}
            initialDate={dateParam}
          />
        </div>
        <DiaryMobileNav />
      </div>
    </GyokanThemeProvider>
  );
}

export default function DiaryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[var(--gyokan-bg)] text-[13px] text-gray-400">
          読み込み中…
        </div>
      }
    >
      <DiaryPageContent />
    </Suspense>
  );
}
